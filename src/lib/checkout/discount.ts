/**
 * Multi-test discount rules — gated on repeat-client status.
 *
 * When the cart holds >= 2 order lines AND the account has at least
 * one prior paid order, every line receives a flat $20 CAD discount.
 * First-time customers and guests see catalogue price parity. An
 * "order line" is one test assigned to one person — the same test
 * assigned to two people counts as two lines.
 *
 * Eligibility (`isEligible`) is authoritative server-side — the
 * checkout API routes call `isRepeatClient()` from
 * `repeatClientEligibility.ts` and pass the result here. Client-side
 * calls (cart bar, checkout summary) read from the RepeatClient
 * context, which is display-only; a spoofed client value cannot
 * unlock a discount because the Stripe route recomputes it.
 *
 * The default is `isEligible = false` so any caller that hasn't been
 * updated fails safe (no discount).
 */

export const DISCOUNT_PER_LINE_CAD = 20;
export const DISCOUNT_MIN_LINES = 2;

export interface DiscountInfo {
  /** True when at least DISCOUNT_MIN_LINES lines are in the order AND
   *  the caller has passed isEligible=true. */
  applies: boolean;
  /** Discount per line when applicable, 0 otherwise. */
  per_line: number;
  /** Number of order lines the discount was computed against. */
  line_count: number;
  /** Total discount amount (per_line × line_count). */
  total: number;
}

export function computeDiscount(
  lineCount: number,
  isEligible: boolean = false,
): DiscountInfo {
  if (!isEligible || lineCount < DISCOUNT_MIN_LINES) {
    return {
      applies: false,
      per_line: 0,
      line_count: lineCount,
      total: 0,
    };
  }
  return {
    applies: true,
    per_line: DISCOUNT_PER_LINE_CAD,
    line_count: lineCount,
    total: DISCOUNT_PER_LINE_CAD * lineCount,
  };
}
