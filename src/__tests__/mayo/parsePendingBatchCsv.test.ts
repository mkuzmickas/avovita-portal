import { describe, it, expect } from "vitest";
import { parsePendingBatchCsv } from "@/lib/mayo/parsePendingBatchCsv";

/** Builds a minimal CSV with the columns the parser requires. */
function makeCsv(rows: string[]): string {
  const header =
    "Account Number,Order Number,Medical Record Number," +
    "Collection Date,Last Name,First Name,Middle Name," +
    "Date of Birth,Sex,Tests Ordered,Status,Created At";
  return [header, ...rows].join("\n");
}

describe("parsePendingBatchCsv", () => {
  it("rejects empty input", () => {
    const out = parsePendingBatchCsv("");
    expect(out.valid).toBe(false);
    expect(out.errors[0]).toMatch(/empty/i);
  });

  it("rejects CSV missing required columns", () => {
    const out = parsePendingBatchCsv("Account Number,Last Name\n123,Smith");
    expect(out.valid).toBe(false);
    expect(out.errors[0]).toMatch(/Missing required column/);
    expect(out.errors[0]).toContain("Order Number");
  });

  it("parses a single row with one quoted multi-line tests cell", () => {
    const csv = makeCsv([
      `AVOV,WEBQ65R9YL2M,1CJ5UL2J8,11 Jun 2026,Hassard,Ryan,,30 Nov 1982,M,"CSTCE Cystatin C with Estimated Glomerular Filtration Rate (eGFR), Serum\nAPOAB Apolipoprotein B, Serum\nHSCRP High-Sensitivity C-Reactive Protein, Serum",Pending Batch,2026-06-11T08:00:00Z`,
    ]);
    const out = parsePendingBatchCsv(csv);
    expect(out.valid).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(1);
    const r = out.rows[0];
    expect(r.mayo_order_number).toBe("WEBQ65R9YL2M");
    expect(r.mayo_patient_id).toBe("1CJ5UL2J8");
    expect(r.collection_date).toBe("11 Jun 2026");
    expect(r.first_name).toBe("Ryan");
    expect(r.last_name).toBe("Hassard");
    expect(r.date_of_birth).toBe("30 Nov 1982");
    expect(r.sex).toBe("M");
    expect(r.status).toBe("Pending Batch");
    expect(r.tests).toHaveLength(3);
    expect(r.tests[0].sku).toBe("CSTCE");
    expect(r.tests[0].name).toContain("Cystatin C");
    expect(r.tests[1].sku).toBe("APOAB");
    expect(r.tests[2].sku).toBe("HSCRP");
    expect(r.warnings).toEqual([]);
  });

  it("handles a BOM-prefixed CSV (Excel)", () => {
    const csv =
      "﻿" +
      makeCsv([
        `A,W1,M1,1 Jan 2026,Doe,Jane,,1 Jan 1990,F,"CSTCE Cystatin C, Serum",Pending Batch,2026-01-01`,
      ]);
    const out = parsePendingBatchCsv(csv);
    expect(out.valid).toBe(true);
    expect(out.rows[0].mayo_order_number).toBe("W1");
  });

  it("flags but does not drop rows with missing data", () => {
    const csv = makeCsv([
      `A,W1,,1 Jan 2026,,Jane,,1 Jan 1990,F,"CSTCE Cystatin C, Serum",Pending Batch,2026-01-01`,
    ]);
    const out = parsePendingBatchCsv(csv);
    expect(out.valid).toBe(true);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].warnings).toContain("missing Medical Record Number");
    expect(out.rows[0].warnings).toContain("missing Last Name");
  });

  it("skips totally-blank trailing rows", () => {
    const csv = makeCsv([
      `A,W1,M1,1 Jan 2026,Doe,Jane,,1 Jan 1990,F,"CSTCE Cystatin C, Serum",Pending Batch,2026-01-01`,
      `,,,,,,,,,,,`,
      ``,
    ]);
    const out = parsePendingBatchCsv(csv);
    expect(out.rows).toHaveLength(1);
  });

  it("returns warnings (not crash) for a tests cell with only blank lines", () => {
    const csv = makeCsv([
      `A,W1,M1,1 Jan 2026,Doe,Jane,,1 Jan 1990,F,"   \n   ",Pending Batch,2026-01-01`,
    ]);
    const out = parsePendingBatchCsv(csv);
    expect(out.valid).toBe(true);
    expect(out.rows[0].tests).toHaveLength(0);
    expect(out.rows[0].warnings.join(" ")).toMatch(
      /Tests Ordered/,
    );
  });

  it("normalizes sex outside M/F to null", () => {
    const csv = makeCsv([
      `A,W1,M1,1 Jan 2026,Doe,Jane,,1 Jan 1990,X,"CSTCE Cystatin C",Pending Batch,2026-01-01`,
    ]);
    const out = parsePendingBatchCsv(csv);
    expect(out.rows[0].sex).toBeNull();
  });

  it("rejects a CSV with header-only", () => {
    const out = parsePendingBatchCsv(
      "Account Number,Order Number,Medical Record Number,Last Name,First Name,Date of Birth,Tests Ordered,Status",
    );
    expect(out.valid).toBe(false);
    expect(out.errors[0]).toMatch(/no data rows/i);
  });
});
