import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  renderInvoiceNotificationEmail,
  invoiceNotificationSubject,
  invoiceNotificationSmsBody,
} from "@/lib/emails/invoiceNotification";
import { resend } from "@/lib/resend";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";

export const runtime = "nodejs";

/**
 * POST /api/admin/invoices/[id]/resend
 *
 * Resends the AvoVita-branded email + Twilio SMS for an already-sent
 * invoice. Uses the existing stripe_hosted_invoice_url — does NOT
 * re-fire Stripe's hosted-invoice-email (Stripe rate-limits that
 * directly via its dashboard).
 *
 * Allowed only on 'sent' invoices. Paid + void invoices are no-ops.
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
    if (
      (accountRow as { role?: string } | null)?.role !== "admin"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const service = createServiceRoleClient();

    const { data: invoiceRaw } = await service
      .from("invoices")
      .select(
        `id, invoice_number, account_id, status, invoice_type, total_cad,
         stripe_hosted_invoice_url, order_id`,
      )
      .eq("id", id)
      .maybeSingle();
    type InvoiceRow = {
      id: string;
      invoice_number: string;
      account_id: string;
      status: "draft" | "sent" | "paid" | "void";
      invoice_type: "products" | "order_amendment";
      total_cad: number;
      stripe_hosted_invoice_url: string | null;
      order_id: string | null;
    };
    const invoice = invoiceRaw as InvoiceRow | null;
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status !== "sent") {
      return NextResponse.json(
        { error: `Cannot resend an invoice in status '${invoice.status}'` },
        { status: 409 },
      );
    }
    if (!invoice.stripe_hosted_invoice_url) {
      return NextResponse.json(
        { error: "Invoice has no hosted Stripe URL to share" },
        { status: 409 },
      );
    }

    const { data: linesRaw } = await service
      .from("invoice_line_items")
      .select("description, quantity, unit_price_cad")
      .eq("invoice_id", invoice.id)
      .order("sort_order", { ascending: true });
    const lines =
      (linesRaw as Array<{
        description: string;
        quantity: number;
        unit_price_cad: number;
      }> | null) ?? [];

    // Customer fields.
    const { data: accountInfo } = await service
      .from("accounts")
      .select("email")
      .eq("id", invoice.account_id)
      .maybeSingle();
    const customerEmail =
      (accountInfo as { email: string | null } | null)?.email ?? null;
    const { data: profileForName } = await service
      .from("patient_profiles")
      .select("first_name, phone")
      .eq("account_id", invoice.account_id)
      .eq("is_primary", true)
      .maybeSingle();
    const customerFirstName =
      (profileForName as { first_name: string | null } | null)?.first_name ??
      "there";
    const customerPhone =
      (profileForName as { phone: string | null } | null)?.phone ?? null;

    let relatedOrderShort: string | null = null;
    if (invoice.invoice_type === "order_amendment" && invoice.order_id) {
      relatedOrderShort = invoice.order_id.slice(0, 8).toUpperCase();
    }

    let emailSent = false;
    let smsSent = false;
    if (customerEmail) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_ORDERS!,
          to: customerEmail,
          subject: invoiceNotificationSubject(
            invoice.invoice_number,
            invoice.invoice_type,
          ),
          html: renderInvoiceNotificationEmail({
            firstName: customerFirstName,
            invoiceNumber: invoice.invoice_number,
            totalCad: invoice.total_cad,
            hostedInvoiceUrl: invoice.stripe_hosted_invoice_url,
            lines: lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPriceCad: l.unit_price_cad,
            })),
            invoiceType: invoice.invoice_type,
            relatedOrderShort,
          }),
        });
        emailSent = true;
      } catch (err) {
        console.warn("[invoices:resend] email failed:", err);
      }
    }
    if (customerPhone && twilioClient) {
      try {
        await twilioClient.messages.create({
          from: TWILIO_FROM,
          to: customerPhone,
          body: invoiceNotificationSmsBody({
            firstName: customerFirstName,
            invoiceNumber: invoice.invoice_number,
            totalCad: invoice.total_cad,
            hostedInvoiceUrl: invoice.stripe_hosted_invoice_url,
          }),
        });
        smsSent = true;
      } catch (err) {
        console.warn("[invoices:resend] SMS failed:", err);
      }
    }

    await service
      .from("analytics_events")
      .insert({
        event_type: "invoice_resent",
        event_data: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          admin_user_id: user.id,
          amount_cad: invoice.total_cad,
          email: emailSent,
          sms: smsSent,
        },
        account_id: invoice.account_id,
      })
      .then(({ error }) => {
        if (error)
          console.warn(
            "[invoices:resend] analytics insert failed:",
            error.message,
          );
      });

    return NextResponse.json({ email: emailSent, sms: smsSent });
  } catch (err) {
    console.error("[invoices:resend]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
