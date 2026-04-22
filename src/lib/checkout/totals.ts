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
  /** Additional discount carried from an accepted quote (resolved CAD
   *  dollars). Applied alongside the Stripe promo, but independently —
   *  both can stack. */
  quoteDiscount?: number;
}

export interface Totals {
  testsSubtotal: number;
  multiTestDiscount: number;
  subtotalAfterDiscount: number;
  visitFee: number;
  promoDiscount: number;
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
  quoteDiscount = 0,
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

  // Quote discount is applied first (it's promised by the quote), then
  // Stripe promo on top. Both clamp against running remainder so the
  // pre-tax total can't go below zero.
  const clampedQuoteDiscount = Math.max(
    0,
    Math.min(quoteDiscount, preDiscountTotal)
  );
  const afterQuoteDiscount = preDiscountTotal - clampedQuoteDiscount;

  // Promo discount — branches on type. All paths clamp so the running
  // total can't go negative. See src/lib/promo/promoCodes.ts for the
  // registry and the canonical `applyPromoCode` logic.
  let promoDiscount = 0;
  if (appliedPromo) {
    switch (appliedPromo.type) {
      case "flolabs_base_fee_waiver": {
        // Targets only the visit fee line, capped at the line's
        // current charge. If a quote discount or prior mechanism has
        // already reduced the visit fee below the target, the effective
        // discount shrinks to match — mirrors the registry's notice.
        const target = appliedPromo.amountCad ?? 0;
        promoDiscount = Math.min(target, Math.max(0, visitFee));
        break;
      }
      case "whole_cart_percent": {
        promoDiscount =
          afterQuoteDiscount * ((appliedPromo.percentOff ?? 0) / 100);
        break;
      }
      case "whole_cart_amount": {
        promoDiscount = appliedPromo.amountCad ?? 0;
        break;
      }
    }
    promoDiscount = Math.max(0, Math.min(promoDiscount, afterQuoteDiscount));
  }

  const subtotalBeforeTax = Math.max(0, afterQuoteDiscount - promoDiscount);
  const estimatedGST = calculateGST(subtotalBeforeTax);
  const grandTotal = subtotalBeforeTax + estimatedGST;

  return {
    testsSubtotal,
    multiTestDiscount,
    subtotalAfterDiscount,
    visitFee,
    promoDiscount,
    quoteDiscount: clampedQuoteDiscount,
    subtotalBeforeTax,
    estimatedGST,
    grandTotal,
  };
}
