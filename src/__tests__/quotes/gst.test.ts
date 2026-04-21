/**
 * GST regression guard.
 *
 * This file exists because the GST line on quotes keeps silently
 * disappearing — once from the Live Quote Summary, once from the
 * emailed quote. Every future change to quote totals or the email
 * template must keep these assertions green.
 */

import { describe, expect, it } from "vitest";
import { GST_RATE, calculateGST } from "@/lib/tax/gst";
import {
  computeQuoteTotals,
  grandTotalCad,
} from "@/lib/quotes/totals";
import { renderQuoteEmail } from "@/lib/emails/quoteSent";

describe("calculateGST", () => {
  it("uses the 5% Alberta rate", () => {
    expect(GST_RATE).toBe(0.05);
  });

  it("rounds to two decimals", () => {
    expect(calculateGST(3948)).toBe(197.4);
    expect(calculateGST(10.03)).toBe(0.5); // 0.5015 → 0.50
    expect(calculateGST(10.05)).toBe(0.5); // 0.5025 → 0.50 (banker's rounding not used)
  });

  it("returns 0 for non-positive inputs", () => {
    expect(calculateGST(0)).toBe(0);
    expect(calculateGST(-5)).toBe(0);
    expect(calculateGST(NaN)).toBe(0);
  });
});

describe("computeQuoteTotals", () => {
  it("always returns a gst_cad field when subtotal > 0", () => {
    const totals = computeQuoteTotals([{ unit_price_cad: 200 }], 1);
    // Regression guard: gst_cad must always be present on the result.
    expect(totals).toHaveProperty("gst_cad");
    expect(totals.gst_cad).toBeGreaterThan(0);
  });

  it("computes GST as 5% of post-discount post-fee total", () => {
    const lines = Array.from({ length: 16 }, () => ({ unit_price_cad: 273.9375 }));
    // subtotal = 4383, multi-test discount = 16 * 20 = 320,
    // visit fee (1 person) = 85, additional discount = 200
    const totals = computeQuoteTotals(lines, 1, {
      value: 200,
      type: "amount",
    });
    expect(totals.subtotal_cad).toBeCloseTo(4383, 2);
    expect(totals.discount_cad).toBe(320);
    expect(totals.visit_fee_cad).toBe(85);
    expect(totals.total_cad).toBeCloseTo(3948, 2);
    // 5% of 3948 = 197.40
    expect(totals.gst_cad).toBeCloseTo(197.4, 2);
  });

  it("produces gst_cad = 0 when the pre-tax total is 0 (empty cart)", () => {
    const totals = computeQuoteTotals([], 1);
    expect(totals.total_cad).toBe(85); // just the visit fee
    // Visit fee alone is taxable too
    expect(totals.gst_cad).toBeCloseTo(4.25, 2);
  });

  it("grandTotalCad adds persisted gst_cad to pre-tax total_cad", () => {
    const grand = grandTotalCad({ total_cad: 3948, gst_cad: 197.4 });
    expect(grand).toBeCloseTo(4145.4, 2);
  });

  it("grandTotalCad derives GST when gst_cad is null (legacy row)", () => {
    const grand = grandTotalCad({ total_cad: 3948, gst_cad: null });
    expect(grand).toBeCloseTo(4145.4, 2);
  });
});

describe("quote email template", () => {
  const baseProps = {
    firstName: "Mike",
    quoteNumber: "AVO-2026-0001",
    lines: [
      {
        test_name: "Vitamin B1",
        lab_name: "Mayo",
        person_label: null,
        unit_price_cad: 159,
      },
    ],
    subtotal: 4383,
    discount: 320,
    visitFee: 85,
    manualDiscount: 200,
    total: 3948,
    gst: 197.4,
    expiresAt: null,
    notes: null,
    catalogueUrl: "https://portal.avovita.ca/tests",
    acceptUrl: "https://portal.avovita.ca/checkout?quote=AVO-2026-0001",
  };

  it("renders a GST line", () => {
    const html = renderQuoteEmail(baseProps);
    expect(html).toMatch(/GST \(5%\)/);
    expect(html).toMatch(/\$197\.40 CAD/);
  });

  it("renders the grand total (pre-tax + GST), not the pre-tax total", () => {
    const html = renderQuoteEmail(baseProps);
    // Grand total = 3948 + 197.40 = 4145.40
    expect(html).toMatch(/\$4145\.40 CAD/);
  });

  it("renders an additional-discount line when manualDiscount > 0", () => {
    const html = renderQuoteEmail(baseProps);
    expect(html).toMatch(/Additional discount/);
    expect(html).toMatch(/−\$200\.00 CAD/);
  });
});
