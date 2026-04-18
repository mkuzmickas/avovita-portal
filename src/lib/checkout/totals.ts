import type { AppliedPromo } from "./types";
import { computeDiscount } from "./discount";

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
}

export interface Totals {
  testsSubtotal: number;
  multiTestDiscount: number;
  subtotalAfterDiscount: number;
  visitFee: number;
  promoDiscount: number;
  grandTotal: number;
}

/**
 * Single source of truth for every monetary number shown to the user
 * during checkout. Both the Step 4 review pane and the right-rail
 * order summary call this with the same inputs so they cannot drift
 * out of sync. All values returned are in CAD dollars.
 *
 * The promo discount is calculated against the FULL cart total
 * (tests + visit fee + supplements + resources + shipping), matching
 * what checkout-unified actually applies to Stripe line items.
 */
export function calculateTotals({
  testLinePrices,
  visitFee,
  appliedPromo,
  supplementSubtotal = 0,
  resourceSubtotal = 0,
  supplementShippingFee = 0,
}: TotalsInput): Totals {
  const testsSubtotal = testLinePrices.reduce((s, p) => s + p, 0);
  const multiTestDiscount = computeDiscount(testLinePrices.length).total;
  const subtotalAfterDiscount = Math.max(0, testsSubtotal - multiTestDiscount);

  // Full pre-discount total — all line types, matching what
  // checkout-unified applies the promo discount against.
  const preDiscountTotal =
    subtotalAfterDiscount +
    visitFee +
    supplementSubtotal +
    resourceSubtotal +
    supplementShippingFee;

  let promoDiscount = 0;
  if (appliedPromo) {
    if (typeof appliedPromo.percentOff === "number") {
      promoDiscount = preDiscountTotal * (appliedPromo.percentOff / 100);
    } else if (typeof appliedPromo.amountOff === "number") {
      // Stripe returns amountOff in the smallest currency unit (cents).
      promoDiscount = appliedPromo.amountOff / 100;
    }
    promoDiscount = Math.min(promoDiscount, preDiscountTotal);
  }

  const grandTotal = Math.max(0, preDiscountTotal - promoDiscount);

  return {
    testsSubtotal,
    multiTestDiscount,
    subtotalAfterDiscount,
    visitFee,
    promoDiscount,
    grandTotal,
  };
}
