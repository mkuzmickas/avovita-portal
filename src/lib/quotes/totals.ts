import { computeDiscount } from "@/lib/checkout/discount";
import { computeVisitFees } from "@/lib/checkout/visit-fees";
import { calculateGST } from "@/lib/tax/gst";

export interface QuoteTotals {
  subtotal_cad: number;
  discount_cad: number;
  visit_fee_cad: number;
  /** Pre-tax total. The grand total shown to the customer is
   *  `total_cad + gst_cad`. */
  total_cad: number;
  /** 5% GST on total_cad. Persisted so tax stays stable if the rate
   *  ever shifts. */
  gst_cad: number;
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
  const gst = calculateGST(total);
  return {
    subtotal_cad: subtotal,
    discount_cad: discount,
    visit_fee_cad: visitFee,
    total_cad: total,
    gst_cad: gst,
  };
}

/**
 * Grand total including GST. Use this for any customer-facing "Total"
 * display (UI summary + emailed quote). Never persist this — persist
 * `total_cad` and `gst_cad` separately.
 */
export function grandTotalCad(totals: {
  total_cad: number;
  gst_cad: number | null;
}): number {
  const gst = totals.gst_cad ?? calculateGST(totals.total_cad);
  return Math.round((totals.total_cad + gst) * 100) / 100;
}
