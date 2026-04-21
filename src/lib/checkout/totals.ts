import type { AppliedPromo } from "./types";
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
  /** Resolved Stripe promo, or null. */
  appliedPromo: AppliedPromo | null;
  /** Supplement subtotal in CAD dollars (default 0). */
  supplementSubtotal?: number;
  /** Resource subtotal in CAD dollars (default 0). */
  resourceSubtotal?: number;
  /** Supplement shipping fee in CAD dollars (default 0). */
  supplementShippingFee?: number;
  /** Self-collected kit service fee in CAD dollars (default 0). */
  kitServiceFee?: number;
}

export interface Totals {
  testsSubtotal: number;
  multiTestDiscount: number;
  subtotalAfterDiscount: number;
  visitFee: number;
  promoDiscount: number;
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
 * The estimate matches what most customers (Alberta) will actually
 * pay; out-of-province customers may see a different final amount.
 */
export function calculateTotals({
  testLinePrices,
  visitFee,
  appliedPromo,
  supplementSubtotal = 0,
  resourceSubtotal = 0,
  supplementShippingFee = 0,
  kitServiceFee = 0,
}: TotalsInput): Totals {
  const testsSubtotal = testLinePrices.reduce((s, p) => s + p, 0);
  const multiTestDiscount = computeDiscount(testLinePrices.length).total;
  const subtotalAfterDiscount = Math.max(0, testsSubtotal - multiTestDiscount);

  const preDiscountTotal =
    subtotalAfterDiscount +
    visitFee +
    supplementSubtotal +
    resourceSubtotal +
    supplementShippingFee +
    kitServiceFee;

  let promoDiscount = 0;
  if (appliedPromo) {
    if (typeof appliedPromo.percentOff === "number") {
      promoDiscount = preDiscountTotal * (appliedPromo.percentOff / 100);
    } else if (typeof appliedPromo.amountOff === "number") {
      promoDiscount = appliedPromo.amountOff / 100;
    }
    promoDiscount = Math.min(promoDiscount, preDiscountTotal);
  }

  const subtotalBeforeTax = Math.max(0, preDiscountTotal - promoDiscount);
  const estimatedGST = calculateGST(subtotalBeforeTax);
  const grandTotal = subtotalBeforeTax + estimatedGST;

  return {
    testsSubtotal,
    multiTestDiscount,
    subtotalAfterDiscount,
    visitFee,
    promoDiscount,
    subtotalBeforeTax,
    estimatedGST,
    grandTotal,
  };
}
