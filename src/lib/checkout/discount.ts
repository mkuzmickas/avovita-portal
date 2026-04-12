/**
 * Multi-test discount rules.
 *
 * If the total number of order lines in the cart is >= 2, every order
 * line receives a flat $20 CAD discount. An order line is one test
 * assigned to one person — the same test assigned to two people counts
 * as two lines.
 */

export const DISCOUNT_PER_LINE_CAD = 20;
export const DISCOUNT_MIN_LINES = 2;

export interface DiscountInfo {
  /** True when at least DISCOUNT_MIN_LINES lines are in the order. */
  applies: boolean;
  /** Discount per line when applicable, 0 otherwise. */
  per_line: number;
  /** Number of order lines the discount was computed against. */
  line_count: number;
  /** Total discount amount (per_line × line_count). */
  total: number;
}

export function computeDiscount(lineCount: number): DiscountInfo {
  if (lineCount < DISCOUNT_MIN_LINES) {
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
