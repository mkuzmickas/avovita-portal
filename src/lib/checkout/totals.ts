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
  /** Pre-tax total shown to the user. Tax is calculated by Stripe. */
  grandTotal: number;
}

/**
 * Single source of truth for every monetary number shown to the user
 * during checkout. Both the Step 4 review pane and the right-rail
 * order summary call this with the same inputs so they cannot drift
 * out of sync. All values returned are in CAD dollars.
 *
 * Tax is NOT calculated here — Stripe Tax (automatic) handles tax
 * calculation on its checkout page. The grandTotal here is the
 * pre-tax amount that Stripe will add tax to.
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
