import { describe, expect, it } from "vitest";
import { formatStabilityShort } from "@/lib/tests/stabilityDisplay";
import type { ShipTempFields } from "@/lib/tests/shipTempDisplay";

function row(overrides: Partial<ShipTempFields>): ShipTempFields {
  return {
    ship_temp: null,
    stability_days: null,
    stability_days_frozen: null,
    ...overrides,
  };
}

describe("formatStabilityShort", () => {
  it("refrigerated_only with days → R<days>", () => {
    expect(
      formatStabilityShort(row({ ship_temp: "refrigerated_only", stability_days: 14 }))
    ).toBe("R14");
  });

  it("frozen_only with days → F<days>", () => {
    expect(
      formatStabilityShort(row({ ship_temp: "frozen_only", stability_days: 30 }))
    ).toBe("F30");
  });

  it("ambient_only with days → A<days>", () => {
    expect(
      formatStabilityShort(row({ ship_temp: "ambient_only", stability_days: 7 }))
    ).toBe("A7");
  });

  it("refrigerated_or_frozen with both populated → R<r>/F<f>", () => {
    expect(
      formatStabilityShort(
        row({
          ship_temp: "refrigerated_or_frozen",
          stability_days: 30,
          stability_days_frozen: 30,
        })
      )
    ).toBe("R30/F30");
  });

  it("refrigerated_or_frozen with only refrigerated side → R<r>/null", () => {
    expect(
      formatStabilityShort(
        row({
          ship_temp: "refrigerated_or_frozen",
          stability_days: 30,
          stability_days_frozen: null,
        })
      )
    ).toBe("R30/null");
  });

  it("refrigerated_or_frozen with only frozen side → null/F<f>", () => {
    expect(
      formatStabilityShort(
        row({
          ship_temp: "refrigerated_or_frozen",
          stability_days: null,
          stability_days_frozen: 30,
        })
      )
    ).toBe("null/F30");
  });

  it("refrigerated_or_frozen with both null → 'null' (single token, no prefix)", () => {
    expect(
      formatStabilityShort(
        row({
          ship_temp: "refrigerated_or_frozen",
          stability_days: null,
          stability_days_frozen: null,
        })
      )
    ).toBe("null");
  });

  it("ship_temp set but stability_days null → 'null' (no letter prefix)", () => {
    expect(
      formatStabilityShort(row({ ship_temp: "refrigerated_only", stability_days: null }))
    ).toBe("null");
  });

  it("ship_temp null → 'null' regardless of days", () => {
    expect(
      formatStabilityShort(row({ ship_temp: null, stability_days: 14 }))
    ).toBe("null");
  });
});
