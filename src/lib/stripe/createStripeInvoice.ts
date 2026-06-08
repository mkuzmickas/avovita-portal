import "server-only";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getGstTaxRate } from "@/lib/stripe/getGstTaxRate";

/**
 * Creates and finalises a Stripe Invoice for an AvoVita customer, then
 * sends Stripe's hosted invoice email.
 *
 * GST: we hard-wire 5% via Stripe's TaxRate object, applied as
 * default_tax_rates on the invoice. We deliberately do NOT use
 * automatic_tax — Stripe Tax requires a complete customer address
 * (line + city + postal + country) and most of our customers don't
 * have one on file at invoice-creation time, which would fail with
 * "enough customer location information must be provided". The rate
 * is the same on every order so the fixed-rate approach is correct;
 * see getGstTaxRate.ts for the lookup/cache mechanics.
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
  // 1. Resolve the AvoVita GST 5% tax rate. Cached process-wide after
  //    first call; the only round-trip cost is on a cold-start invoice.
  const gstTaxRateId = await getGstTaxRate();

  // 2. Create the draft invoice. We pass pending_invoice_items_behavior
  //    so it only picks up items we explicitly attach below — prevents
  //    a stray pending item on the customer from sneaking onto this
  //    invoice. default_tax_rates applies the 5% GST to every line we
  //    attach below without needing per-item tax_rates plumbing.
  const invoice = await stripe.invoices.create({
    customer: opts.stripeCustomerId,
    currency: "cad",
    collection_method: "send_invoice",
    days_until_due: opts.daysUntilDue ?? 14,
    default_tax_rates: [gstTaxRateId],
    pending_invoice_items_behavior: "exclude",
    metadata: opts.metadata,
    footer: opts.footerText,
  });
  if (!invoice.id) {
    throw new Error("createStripeInvoice: Stripe returned an invoice without an id");
  }

  // 2. Attach the line items. Stripe's API rule: pass EITHER `amount`
  //    alone (no quantity) OR `unit_amount_decimal` + `quantity` —
  //    never `amount` + `quantity` together. We want the customer to
  //    see the unit price × qty breakdown on the hosted page, so the
  //    second form. Decimal-string is used so we don't lose half-cent
  //    precision on prices that round oddly. Negative values are
  //    accepted directly for discount lines.
  for (const line of opts.lines) {
    // unit_amount_decimal is typed as a branded `Decimal` in this SDK
    // — use Stripe.Decimal.from() to construct one rather than casting.
    // Cents with two decimal places handles half-cent rounding cleanly.
    const unitCents = Stripe.Decimal.from(
      Math.round(line.unitPriceCad * 10000) / 100,
    );
    await stripe.invoiceItems.create({
      customer: opts.stripeCustomerId,
      invoice: invoice.id,
      currency: "cad",
      description: line.description,
      quantity: line.quantity,
      unit_amount_decimal: unitCents,
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
