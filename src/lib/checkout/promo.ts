import type { AppliedPromo } from "./types";

/**
 * Computes the dollar discount a Stripe promotion code will apply to a
 * given pre-promo total. Used for client-side preview only — the
 * authoritative amount is computed by Stripe at checkout.
 *
 *  - percent_off: applied to the running total (clamped to total).
 *  - amount_off:  fixed amount in the smallest currency unit (e.g. cents).
 */
export function computePromoDiscount(
  promo: AppliedPromo | null,
  totalDollars: number
): number {
  if (!promo) return 0;
  if (promo.percent_off != null) {
    return Math.min(totalDollars, totalDollars * (promo.percent_off / 100));
  }
  if (promo.amount_off != null) {
    return Math.min(totalDollars, promo.amount_off / 100);
  }
  return 0;
}

/** Renders a short label like "ABC-DEMO · 100% off" or "ABC-DEMO · −$20.00". */
export function promoLabel(promo: AppliedPromo): string {
  if (promo.percent_off != null) {
    return `${promo.code} · ${promo.percent_off}% off`;
  }
  if (promo.amount_off != null) {
    return `${promo.code} · −$${(promo.amount_off / 100).toFixed(2)} off`;
  }
  return promo.code;
}
