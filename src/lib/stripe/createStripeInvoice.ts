import "server-only";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";

/**
 * Creates and finalises a Stripe Invoice for an AvoVita customer, then
 * sends Stripe's hosted invoice email.
 *
 * GST: `automatic_tax: { enabled: true }` lets Stripe Tax compute and
 * add the 5% Canadian GST line based on the AvoVita business address.
 * If Stripe Tax isn't configured for the account this call throws and
 * the caller falls back to manually appending a 5% line — flagged in
 * the spec.
 *
 * collection_method='send_invoice': customers pay via the hosted page,
 * not auto-charged. We get back a hosted_invoice_url to embed in our
 * own AvoVita-branded notification email and SMS.
 *
 * Currency CAD; description text only — no inventory items / Stripe
 * Prices, so each line is built ad-hoc per invoice.
 */

export interface StripeInvoiceLine {
  description: string;
  /** Unit price in CAD dollars (positive for charges; negative for
   *  discounts — Stripe accepts negative line amounts via amount_off). */
  unitPriceCad: number;
  quantity: number;
}

export interface CreatedStripeInvoice {
  stripe_invoice_id: string;
  hosted_invoice_url: string | null;
  stripe_customer_id: string;
  subtotal_cad: number;
  tax_cad: number;
  total_cad: number;
}

export async function createStripeInvoice(opts: {
  stripeCustomerId: string;
  lines: StripeInvoiceLine[];
  /**
   * Internal reference shown in Stripe's admin only. We pass our
   * AVO-XXXX number plus the related order id (Flow A) so the Stripe
   * dashboard mirrors what an admin sees in our UI.
   */
  metadata?: Record<string, string>;
  /**
   * Footer text rendered at the bottom of Stripe's hosted invoice
   * page and on Stripe's invoice PDF. Used for any admin notes meant
   * for the customer.
   */
  footerText?: string;
  /**
   * Days the customer has to pay after Stripe sends the email. Default
   * 14. The hosted link stays live indefinitely either way — this
   * just controls Stripe's reminder cadence.
   */
  daysUntilDue?: number;
}): Promise<CreatedStripeInvoice> {
  // 1. Create the draft invoice. We pass pending_invoice_items_behavior
  //    so it only picks up items we explicitly attach below — prevents
  //    a stray pending item on the customer from sneaking onto this
  //    invoice.
  const invoice = await stripe.invoices.create({
    customer: opts.stripeCustomerId,
    currency: "cad",
    collection_method: "send_invoice",
    days_until_due: opts.daysUntilDue ?? 14,
    automatic_tax: { enabled: true },
    pending_invoice_items_behavior: "exclude",
    metadata: opts.metadata,
    footer: opts.footerText,
  });
  if (!invoice.id) {
    throw new Error("createStripeInvoice: Stripe returned an invoice without an id");
  }

  // 2. Attach the line items. Stripe wants the total line amount in
  //    CENTS as `amount` (= unit_price * quantity rounded to int). The
  //    SDK API version 2026-03-25.dahlia removed the per-create
  //    unit_amount field; the docs say `amount` should equal
  //    unit_amount * quantity. Round to avoid floating-point drift.
  for (const line of opts.lines) {
    const amountCents = Math.round(line.unitPriceCad * line.quantity * 100);
    await stripe.invoiceItems.create({
      customer: opts.stripeCustomerId,
      invoice: invoice.id,
      currency: "cad",
      description: line.description,
      quantity: line.quantity,
      amount: amountCents,
    });
  }

  // 3. Finalise (computes tax + locks line items) and send.
  const finalised = await stripe.invoices.finalizeInvoice(invoice.id);
  if (!finalised.id) {
    throw new Error("createStripeInvoice: finalised invoice missing id");
  }
  // sendInvoice() triggers Stripe's own customer email. Our additional
  // AvoVita-branded email + SMS are sent by the caller after this.
  let sent: Stripe.Invoice;
  try {
    sent = await stripe.invoices.sendInvoice(finalised.id);
  } catch (err) {
    // If Stripe's email send fails (rare — invalid email, etc.) we
    // still want to return the finalised invoice so the admin can
    // surface the hosted URL. Surface the error in logs only.
    console.warn("[createStripeInvoice] sendInvoice failed:", err);
    sent = finalised;
  }

  // Stripe v2026-03-25.dahlia removed the convenience `tax` total on
  // the Invoice — derive it from total minus total_excluding_tax (both
  // present in this version). When automatic_tax is off both equal.
  const total = sent.total ?? 0;
  const totalExclTax = sent.total_excluding_tax ?? total;
  return {
    stripe_invoice_id: sent.id ?? finalised.id,
    hosted_invoice_url: sent.hosted_invoice_url ?? null,
    stripe_customer_id: opts.stripeCustomerId,
    // Stripe gives totals in cents; convert back to dollars for our row.
    subtotal_cad: (sent.subtotal ?? 0) / 100,
    tax_cad: (total - totalExclTax) / 100,
    total_cad: total / 100,
  };
}
