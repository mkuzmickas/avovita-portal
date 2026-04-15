import type { AppliedPromo } from "./types";
import { computeDiscount } from "./discount";

export interface TotalsInput {
  /** Sum of test prices (CAD dollars), one entry per assigned line. */
  testLinePrices: number[];
  /** Pre-computed home-visit fee in CAD dollars. */
  visitFee: number;
  /** Resolved Stripe promo, or null. */
  appliedPromo: AppliedPromo | null;
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
 */
export function calculateTotals({
  testLinePrices,
  visitFee,
  appliedPromo,
}: TotalsInput): Totals {
  const testsSubtotal = testLinePrices.reduce((s, p) => s + p, 0);
  const multiTestDiscount = computeDiscount(testLinePrices.length).total;
  const subtotalAfterDiscount = Math.max(0, testsSubtotal - multiTestDiscount);

  const preDiscountTotal = subtotalAfterDiscount + visitFee;

  let promoDiscount = 0;
  if (appliedPromo) {
    if (typeof appliedPromo.percent_off === "number") {
      promoDiscount = preDiscountTotal * (appliedPromo.percent_off / 100);
    } else if (typeof appliedPromo.amount_off === "number") {
      // Stripe returns amount_off in the smallest currency unit (cents).
      promoDiscount = appliedPromo.amount_off / 100;
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
