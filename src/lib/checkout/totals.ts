import { computeDiscount } from "./discount";
import { GST_RATE, calculateGST } from "@/lib/tax/gst";

/**
 * @deprecated Use `GST_RATE` from `@/lib/tax/gst` directly. Re-exported
 * here as a soft alias during migration to the single source of truth.
 */
export const ESTIMATED_GST_RATE = GST_RATE;

export interface TotalsInput {
  /** Sum of test prices (CAD dollars), one entry per assigned line. */
  testLinePrices: number[];
  /** Pre-computed home-visit fee in CAD dollars. */
  visitFee: number;
  /** Supplement subtotal in CAD dollars (default 0). */
  supplementSubtotal?: number;
  /** Resource subtotal in CAD dollars (default 0). */
  resourceSubtotal?: number;
  /** Supplement shipping fee in CAD dollars (default 0). */
  supplementShippingFee?: number;
  /** Self-collected kit service fee in CAD dollars (default 0). */
  kitServiceFee?: number;
  /** Additional discount carried from an accepted quote (resolved CAD
   *  dollars). Reduces the pre-tax subtotal. Only Mike's admin quote
   *  flow produces this — the removed customer-facing promo path was
   *  the other one, but we deleted it because nobody used it. */
  quoteDiscount?: number;
  /** Custom-line amounts (CAD dollars) carried from an accepted quote.
   *  Each entry is one line; positives are charges, negatives are
   *  credits. Folded into the pre-tax subtotal so GST recalcs on the
   *  combined total. Stripe gets one line item per entry; the webhook
   *  persists each into order_lines with line_type='custom'. */
  customLineAmounts?: number[];
}

export interface Totals {
  testsSubtotal: number;
  multiTestDiscount: number;
  subtotalAfterDiscount: number;
  visitFee: number;
  /** Sum of custom-line amounts (positive = charge, negative = credit).
   *  Echoed back so the UI can render a single "Custom charges" rollup
   *  if it wants; per-line rendering walks the input list directly. */
  customLinesTotal: number;
  /** Additional discount from an accepted quote. 0 when not a quote
   *  acceptance flow. */
  quoteDiscount: number;
  /** Pre-tax subtotal (post-discount). */
  subtotalBeforeTax: number;
  /** Estimated GST at Alberta rate — display only. Stripe Tax is authoritative. */
  estimatedGST: number;
  /** Estimated grand total including GST. */
  grandTotal: number;
}

/**
 * Single source of truth for every monetary number shown to the user
 * during checkout. Both the Step 4 review pane and the right-rail
 * order summary call this with the same inputs so they cannot drift
 * out of sync. All values returned are in CAD dollars.
 *
 * estimatedGST is a display estimate (5% Alberta rate). Stripe Tax
 * (automatic) computes the actual tax on the Stripe checkout page.
 */
export function calculateTotals({
  testLinePrices,
  visitFee,
  supplementSubtotal = 0,
  resourceSubtotal = 0,
  supplementShippingFee = 0,
  kitServiceFee = 0,
  quoteDiscount = 0,
  customLineAmounts = [],
}: TotalsInput): Totals {
  const testsSubtotal = testLinePrices.reduce((s, p) => s + p, 0);
  const multiTestDiscount = computeDiscount(testLinePrices.length).total;
  const subtotalAfterDiscount = Math.max(0, testsSubtotal - multiTestDiscount);

  const customLinesTotal = customLineAmounts.reduce(
    (s, a) => s + (Number.isFinite(a) ? a : 0),
    0
  );

  const preDiscountTotal =
    subtotalAfterDiscount +
    visitFee +
    supplementSubtotal +
    resourceSubtotal +
    supplementShippingFee +
    kitServiceFee +
    customLinesTotal;

  // Quote discount is applied last. Clamps against the running total
  // so subtotalBeforeTax can't go negative even if the quote's
  // additional discount was set larger than the cart value.
  const clampedQuoteDiscount = Math.max(
    0,
    Math.min(quoteDiscount, preDiscountTotal)
  );
  const subtotalBeforeTax = Math.max(
    0,
    preDiscountTotal - clampedQuoteDiscount,
  );
  const estimatedGST = calculateGST(subtotalBeforeTax);
  const grandTotal = subtotalBeforeTax + estimatedGST;

  return {
    testsSubtotal,
    multiTestDiscount,
    subtotalAfterDiscount,
    visitFee,
    customLinesTotal: Math.round(customLinesTotal * 100) / 100,
    quoteDiscount: clampedQuoteDiscount,
    subtotalBeforeTax,
    estimatedGST,
    grandTotal,
  };
}
