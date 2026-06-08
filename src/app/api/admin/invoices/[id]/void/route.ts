import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/admin/invoices/[id]/void
 *
 * Voids both the local invoice row and the Stripe Invoice. Allowed
 * only when status is 'draft' or 'sent'. Paid invoices can't be
 * voided — refunds happen in Stripe manually (Mike's existing process).
 *
 * The actual webhook handler in src/app/api/stripe/webhook/route.ts
 * also accepts invoice.voided / invoice.marked_uncollectible events
 * so an admin can void directly in Stripe's dashboard and we sync
 * back — this endpoint just provides an in-app shortcut.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: accountRow } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if ((accountRow as { role?: string } | null)?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const service = createServiceRoleClient();

    const { data: invoiceRaw } = await service
      .from("invoices")
      .select(
        "id, invoice_number, account_id, status, total_cad, invoice_type, stripe_invoice_id",
      )
      .eq("id", id)
      .maybeSingle();
    type InvoiceRow = {
      id: string;
      invoice_number: string;
      account_id: string;
      status: "draft" | "sent" | "paid" | "void";
      total_cad: number;
      invoice_type: string;
      stripe_invoice_id: string | null;
    };
    const invoice = invoiceRaw as InvoiceRow | null;
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "paid") {
      return NextResponse.json(
        {
          error:
            "Paid invoices can't be voided — refund through Stripe directly.",
        },
        { status: 409 },
      );
    }
    if (invoice.status === "void") {
      return NextResponse.json({ ok: true, alreadyVoid: true });
    }

    // Void in Stripe first so we don't end up with a synced row pointing
    // at an active Stripe invoice. If Stripe fails, surface it and
    // leave our row alone — admin can retry.
    if (invoice.stripe_invoice_id) {
      try {
        await stripe.invoices.voidInvoice(invoice.stripe_invoice_id);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Stripe void failed";
        return NextResponse.json(
          { error: `Stripe void failed: ${msg}` },
          { status: 502 },
        );
      }
    }

    await service
      .from("invoices")
      .update({
        status: "void",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    await service
      .from("analytics_events")
      .insert({
        event_type: "invoice_voided",
        event_data: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_type: invoice.invoice_type,
          amount_cad: invoice.total_cad,
          admin_user_id: user.id,
          via: "admin_ui",
        },
        account_id: invoice.account_id,
      })
      .then(({ error }) => {
        if (error)
          console.warn(
            "[invoices:void] analytics insert failed:",
            error.message,
          );
      });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[invoices:void]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
