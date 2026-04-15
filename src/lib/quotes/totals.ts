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

export interface ManualDiscount {
  value: number;
  type: "amount" | "percent";
}

/**
 * Resolves an admin-entered additional discount to a flat CAD amount,
 * clamped so the quote total cannot go negative.
 */
export function resolveManualDiscount(
  subtotal: number,
  multiDiscount: number,
  visitFee: number,
  manual: ManualDiscount | null
): number {
  if (!manual || !(manual.value > 0)) return 0;
  const subtotalAfterMulti = Math.max(0, subtotal - multiDiscount);
  const raw =
    manual.type === "percent"
      ? subtotalAfterMulti * (Math.min(100, manual.value) / 100)
      : manual.value;
  const clamped = Math.min(Math.max(0, raw), subtotalAfterMulti + visitFee);
  return Math.round(clamped * 100) / 100;
}

/**
 * Recomputes a quote's monetary fields from its lines + person_count
 * + optional admin-entered additional discount. Returns only the
 * columns that exist on public.quotes so the result can be spread
 * straight into a supabase .update().
 *
 *   - $20 multi-test discount per line when 2+ lines.
 *   - zone-1 visit fee base + per-additional-person add-on.
 *   - manual discount applied AFTER the multi-test discount and folded
 *     into total_cad so total_cad is always the customer-facing number.
 *   - total clamped at $0.
 */
export function computeQuoteTotals(
  lines: QuoteLineForTotals[],
  personCount: number,
  manualDiscount: ManualDiscount | null = null
): QuoteTotals {
  const subtotal = lines.reduce((s, l) => s + (l.unit_price_cad ?? 0), 0);
  const discount = computeDiscount(lines.length).total;
  const visitFee = computeVisitFees(Math.max(1, personCount)).total;
  const manualCad = resolveManualDiscount(
    subtotal,
    discount,
    visitFee,
    manualDiscount
  );
  const total = Math.max(0, subtotal - discount + visitFee - manualCad);
  return {
    subtotal_cad: subtotal,
    discount_cad: discount,
    visit_fee_cad: visitFee,
    total_cad: total,
  };
}
