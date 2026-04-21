/**
 * Single source of truth for GST calculation.
 *
 * Every place in the app that multiplies by an Alberta GST rate must import
 * `GST_RATE` / `calculateGST` from here — inline `* 0.05` has regressed
 * before. Stripe Tax remains authoritative for the charged amount at
 * checkout; this utility only produces the pre-charge display / quote
 * estimate.
 */

export const GST_RATE = 0.05;

/**
 * Returns GST on `taxableAmount`, rounded to 2 decimal places.
 * Non-positive inputs return 0 so "no cart" and "discount > total"
 * cases can't produce a negative tax.
 */
export function calculateGST(taxableAmount: number): number {
  if (!(taxableAmount > 0)) return 0;
  return Math.round(taxableAmount * GST_RATE * 100) / 100;
}
