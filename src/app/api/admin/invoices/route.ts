import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer } from "@/lib/stripe/getOrCreateStripeCustomer";
import { createStripeInvoice } from "@/lib/stripe/createStripeInvoice";
import { generateInvoiceNumber } from "@/lib/invoices/generateInvoiceNumber";
import {
  renderInvoiceNotificationEmail,
  invoiceNotificationSubject,
  invoiceNotificationSmsBody,
} from "@/lib/emails/invoiceNotification";
import { resend } from "@/lib/resend";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";

export const runtime = "nodejs";

const VALID_LINE_TYPES = new Set([
  "test",
  "supplement",
  "service",
  "custom",
  "shipping",
  "discount",
]);

/**
 * POST /api/admin/invoices
 *
 * Flow B: create a standalone Products invoice. Atomic in spirit
 * (DB writes first, then Stripe, then notifications) — if Stripe
 * fails, we leave the local invoice row in 'draft' with no
 * stripe_invoice_id so an admin can retry.
 *
 * Body shape:
 *   {
 *     account_id: string,
 *     profile_id?: string,
 *     lines: Array<{
 *       line_type: 'test'|'supplement'|'service'|'custom'|'shipping'|'discount',
 *       test_id?: string,
 *       supplement_id?: string,
 *       description: string,
 *       quantity?: number,
 *       unit_price_cad: number,
 *     }>,
 *     admin_notes?: string,
 *   }
 *
 * Response: 201 { invoice_id, invoice_number, hosted_invoice_url }.
 */
export async function POST(request: NextRequest) {
  try {
    // ─── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: callerAccountRaw } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const callerRole =
      (callerAccountRaw as { role?: string } | null)?.role ?? "patient";
    if (callerRole !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const accountId: string | undefined = body.account_id;
    const profileId: string | null = body.profile_id ?? null;
    const adminNotes: string | null = body.admin_notes?.trim() || null;
    const rawLines = Array.isArray(body.lines) ? body.lines : [];

    if (!accountId) {
      return NextResponse.json(
        { error: "account_id is required" },
        { status: 400 },
      );
    }
    if (rawLines.length === 0) {
      return NextResponse.json(
        { error: "At least one line item is required" },
        { status: 400 },
      );
    }

    // ─── Normalise + validate lines ────────────────────────────────
    type Line = {
      line_type:
        | "test"
        | "supplement"
        | "service"
        | "custom"
        | "shipping"
        | "discount";
      test_id: string | null;
      supplement_id: string | null;
      description: string;
      quantity: number;
      unit_price_cad: number;
      line_total_cad: number;
    };
    const lines: Line[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const r = rawLines[i] as Record<string, unknown>;
      const lt = String(r.line_type ?? "");
      if (!VALID_LINE_TYPES.has(lt)) {
        return NextResponse.json(
          { error: `Line ${i + 1}: invalid line_type '${lt}'` },
          { status: 400 },
        );
      }
      const description = String(r.description ?? "").trim();
      if (!description) {
        return NextResponse.json(
          { error: `Line ${i + 1}: description is required` },
          { status: 400 },
        );
      }
      const quantity = Math.max(1, Math.floor(Number(r.quantity ?? 1)));
      const unitPriceCad = Number(r.unit_price_cad);
      if (!Number.isFinite(unitPriceCad)) {
        return NextResponse.json(
          { error: `Line ${i + 1}: unit_price_cad must be a number` },
          { status: 400 },
        );
      }
      // Discounts must be negative; everything else >= 0.
      if (lt === "discount" && unitPriceCad >= 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: discount unit_price_cad must be negative` },
          { status: 400 },
        );
      }
      if (lt !== "discount" && unitPriceCad < 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: unit_price_cad must be ≥ 0` },
          { status: 400 },
        );
      }
      lines.push({
        line_type: lt as Line["line_type"],
        test_id: r.test_id ? String(r.test_id) : null,
        supplement_id: r.supplement_id ? String(r.supplement_id) : null,
        description,
        quantity,
        unit_price_cad: Math.round(unitPriceCad * 100) / 100,
        line_total_cad: Math.round(unitPriceCad * quantity * 100) / 100,
      });
    }

    // Pre-tax subtotal so we have something sensible on the row even
    // before Stripe gives us its computed totals.
    const subtotalPreview = lines.reduce(
      (s, l) => s + l.line_total_cad,
      0,
    );
    if (subtotalPreview === 0) {
      return NextResponse.json(
        { error: "Invoice total is zero — nothing to charge" },
        { status: 400 },
      );
    }

    const service = createServiceRoleClient();

    // ─── 1. Reserve invoice_number from the sequence ─────────────
    const { number: invoiceNumber } = await generateInvoiceNumber(service);

    // ─── 2. Resolve customer display fields for notifications ────
    const { data: accountRaw } = await service
      .from("accounts")
      .select("email")
      .eq("id", accountId)
      .maybeSingle();
    const customerEmail =
      (accountRaw as { email: string | null } | null)?.email ?? null;
    const { data: profileForName } = await service
      .from("patient_profiles")
      .select("first_name, phone")
      .eq("account_id", accountId)
      .eq("is_primary", true)
      .maybeSingle();
    const customerFirstName =
      (profileForName as { first_name: string | null } | null)?.first_name ??
      "there";
    const customerPhone =
      (profileForName as { phone: string | null } | null)?.phone ?? null;

    // ─── 3. Lazy Stripe Customer link ────────────────────────────
    const stripeCustomerId = await getOrCreateStripeCustomer(
      service,
      accountId,
    );

    // ─── 4. Insert local invoice row + line items (draft state) ─
    const { data: invoiceInsertRaw, error: invInsErr } = await service
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        account_id: accountId,
        profile_id: profileId,
        order_id: null,
        invoice_type: "products",
        status: "draft",
        subtotal_cad: subtotalPreview,
        tax_cad: 0,
        total_cad: subtotalPreview, // patched after Stripe finalises with tax
        created_by: user.id,
        admin_notes: adminNotes,
      })
      .select("id, invoice_number")
      .single();
    if (invInsErr || !invoiceInsertRaw) {
      return NextResponse.json(
        {
          error: `Failed to create invoice row: ${invInsErr?.message ?? "unknown"}`,
        },
        { status: 500 },
      );
    }
    const invoiceRow = invoiceInsertRaw as {
      id: string;
      invoice_number: string;
    };

    const lineInserts = lines.map((l, i) => ({
      invoice_id: invoiceRow.id,
      line_type: l.line_type,
      test_id: l.test_id,
      supplement_id: l.supplement_id,
      description: l.description,
      quantity: l.quantity,
      unit_price_cad: l.unit_price_cad,
      line_total_cad: l.line_total_cad,
      sort_order: i,
    }));
    const { error: lineErr } = await service
      .from("invoice_line_items")
      .insert(lineInserts);
    if (lineErr) {
      // Roll back the invoice row so we don't leak an orphan.
      await service.from("invoices").delete().eq("id", invoiceRow.id);
      return NextResponse.json(
        { error: `Failed to insert line items: ${lineErr.message}` },
        { status: 500 },
      );
    }

    // ─── 5. Create the Stripe Invoice ────────────────────────────
    let stripeResult: Awaited<ReturnType<typeof createStripeInvoice>>;
    try {
      stripeResult = await createStripeInvoice({
        stripeCustomerId,
        lines: lines.map((l) => ({
          description: l.description,
          unitPriceCad: l.unit_price_cad,
          quantity: l.quantity,
        })),
        metadata: {
          avovita_invoice_id: invoiceRow.id,
          avovita_invoice_number: invoiceRow.invoice_number,
        },
        footerText: `Invoice ${invoiceRow.invoice_number} · AvoVita Wellness`,
      });
    } catch (err) {
      // Stripe failed. Leave the local row in 'draft' so an admin can
      // see it (and retry by editing if a Stripe Tax misconfig is the
      // cause). Surface the message verbatim — the admin UI shows it.
      console.error("[invoices:create] Stripe failed:", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? `Stripe error: ${err.message}`
              : "Stripe error",
          invoice_id: invoiceRow.id,
          invoice_number: invoiceRow.invoice_number,
        },
        { status: 502 },
      );
    }

    // ─── 6. Patch the invoice row with Stripe totals + sent state ─
    await service
      .from("invoices")
      .update({
        stripe_invoice_id: stripeResult.stripe_invoice_id,
        stripe_hosted_invoice_url: stripeResult.hosted_invoice_url,
        subtotal_cad: stripeResult.subtotal_cad,
        tax_cad: stripeResult.tax_cad,
        total_cad: stripeResult.total_cad,
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceRow.id);

    // ─── 7. AvoVita-branded email + SMS notifications ────────────
    if (customerEmail && stripeResult.hosted_invoice_url) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_ORDERS!,
          to: customerEmail,
          subject: invoiceNotificationSubject(
            invoiceRow.invoice_number,
            "products",
          ),
          html: renderInvoiceNotificationEmail({
            firstName: customerFirstName,
            invoiceNumber: invoiceRow.invoice_number,
            totalCad: stripeResult.total_cad,
            hostedInvoiceUrl: stripeResult.hosted_invoice_url,
            lines: lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPriceCad: l.unit_price_cad,
            })),
            invoiceType: "products",
          }),
        });
      } catch (err) {
        console.warn("[invoices:create] email notification failed:", err);
      }
    }
    if (customerPhone && twilioClient && stripeResult.hosted_invoice_url) {
      try {
        await twilioClient.messages.create({
          from: TWILIO_FROM,
          to: customerPhone,
          body: invoiceNotificationSmsBody({
            firstName: customerFirstName,
            invoiceNumber: invoiceRow.invoice_number,
            totalCad: stripeResult.total_cad,
            hostedInvoiceUrl: stripeResult.hosted_invoice_url,
          }),
        });
      } catch (err) {
        console.warn("[invoices:create] SMS notification failed:", err);
      }
    }

    // ─── 8. Audit ─────────────────────────────────────────────────
    await service
      .from("analytics_events")
      .insert([
        {
          event_type: "invoice_created",
          event_data: {
            invoice_id: invoiceRow.id,
            invoice_number: invoiceRow.invoice_number,
            invoice_type: "products",
            admin_user_id: user.id,
            amount_cad: stripeResult.total_cad,
          },
          account_id: accountId,
        },
        {
          event_type: "invoice_sent",
          event_data: {
            invoice_id: invoiceRow.id,
            invoice_number: invoiceRow.invoice_number,
            admin_user_id: user.id,
            amount_cad: stripeResult.total_cad,
            email: !!customerEmail,
            sms: !!customerPhone,
          },
          account_id: accountId,
        },
      ])
      .then(({ error }) => {
        if (error)
          console.warn(
            "[invoices:create] analytics insert failed:",
            error.message,
          );
      });

    return NextResponse.json(
      {
        invoice_id: invoiceRow.id,
        invoice_number: invoiceRow.invoice_number,
        hosted_invoice_url: stripeResult.hosted_invoice_url,
        total_cad: stripeResult.total_cad,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[invoices:create]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
