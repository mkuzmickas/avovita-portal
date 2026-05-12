/**
 * Locks down the result-row classifier against the actual values
 * present in production:
 *   • 21 rows with source='order_attached' (every order-attached PDF)
 *   • 1 row with source='manual_upload'
 *   • 0 rows with the literal 'order' that migration 003 declared
 *
 * Pre-fix code branched on `source === 'order'` and silently misclassified
 * every order row. The classifier keys off `order_id` (a structural FK)
 * so any source-string drift can't hide rows again.
 */

import { describe, it, expect } from "vitest";
import {
  classifyResultRow,
  isOrderResult,
  isManualResult,
} from "@/lib/results/classify";

describe("classifyResultRow", () => {
  it("classifies as 'order' when order_id is present, regardless of source string", () => {
    expect(
      classifyResultRow({ source: "order_attached", order_id: "ord-1" })
    ).toBe("order");
    expect(classifyResultRow({ source: "order", order_id: "ord-2" })).toBe(
      "order"
    );
    // Defensive: even an unknown source string with a non-null order_id
    // is structurally an order row.
    expect(classifyResultRow({ source: null, order_id: "ord-3" })).toBe(
      "order"
    );
    expect(
      classifyResultRow({ source: "something_unexpected", order_id: "ord-4" })
    ).toBe("order");
  });

  it("classifies as 'manual' when order_id is null and source is 'manual_upload'", () => {
    expect(
      classifyResultRow({ source: "manual_upload", order_id: null })
    ).toBe("manual");
  });

  it("classifies as 'patient' when order_id is null and source is 'patient_upload'", () => {
    expect(
      classifyResultRow({ source: "patient_upload", order_id: null })
    ).toBe("patient");
  });

  it("falls back to 'manual' when order_id is null and source is unknown/null", () => {
    expect(classifyResultRow({ source: null, order_id: null })).toBe("manual");
    expect(classifyResultRow({ source: "weird", order_id: null })).toBe(
      "manual"
    );
  });

  it("isOrderResult / isManualResult agree with the main classifier", () => {
    expect(
      isOrderResult({ source: "order_attached", order_id: "x" })
    ).toBe(true);
    expect(isOrderResult({ source: "manual_upload", order_id: null })).toBe(
      false
    );
    expect(isManualResult({ source: "manual_upload", order_id: null })).toBe(
      true
    );
    expect(isManualResult({ source: "order_attached", order_id: "x" })).toBe(
      false
    );
  });
});
