import { computeDiscount } from "@/lib/checkout/discount";
import { computeVisitFees } from "@/lib/checkout/visit-fees";

export interface QuoteTotals {
  subtotal_cad: number;
  discount_cad: number;
  visit_fee_cad: number;
  total_cad: number;
}

export interface QuoteLineForTotals {
  unit_price_cad: number;
}

/**
 * Recomputes a quote's monetary fields from its lines + person_count.
 * Mirrors the logic used at checkout: $20 multi-test discount per line
 * when 2+ lines, plus base + per-additional-person home visit fee.
 */
export function computeQuoteTotals(
  lines: QuoteLineForTotals[],
  personCount: number
): QuoteTotals {
  const subtotal = lines.reduce((s, l) => s + (l.unit_price_cad ?? 0), 0);
  const discount = computeDiscount(lines.length).total;
  const visitFee = computeVisitFees(Math.max(1, personCount)).total;
  return {
    subtotal_cad: subtotal,
    discount_cad: discount,
    visit_fee_cad: visitFee,
    total_cad: subtotal - discount + visitFee,
  };
}
