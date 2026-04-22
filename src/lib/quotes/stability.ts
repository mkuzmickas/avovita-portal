/**
 * Quote-composer summaries for ship_temp + stability.
 *
 * All rendering goes through `src/lib/tests/shipTempDisplay.ts`. This
 * file is only responsible for aggregating across a cart: finding the
 * earliest stability limit, the strictest ship_temp, and the list of
 * tests with missing data.
 */

import {
  MISSING_DATA_COLOR,
  SHIP_TEMP_STRICTNESS,
  formatShipTempLong,
  formatStability,
  getCriticalStabilityDays,
  isShippingIncomplete,
  stabilityColorForTest,
  type ShipTemp,
} from "@/lib/tests/shipTempDisplay";

export {
  MISSING_DATA_COLOR,
  formatShipTempLong,
  formatStability,
  getCriticalStabilityDays,
  isShippingIncomplete,
  stabilityColorForTest,
};
export type { ShipTemp };

export type StabilityItem = {
  test_id: string;
  test_name: string;
  ship_temp: ShipTemp | null;
  stability_days: number | null;
  stability_days_frozen: number | null;
};

export type StabilitySummary =
  | { kind: "empty" }
  | {
      kind: "complete";
      /** Worst-case days across the cart (refrigerated window for
       *  refrigerated_or_frozen tests). */
      minDays: number;
      minDaysTestName: string;
    }
  | {
      kind: "missing";
      missingNames: string[];
    };

export function summarizeStability(items: StabilityItem[]): StabilitySummary {
  if (items.length === 0) return { kind: "empty" };
  const missing = items.filter(isShippingIncomplete);
  if (missing.length > 0) {
    return {
      kind: "missing",
      missingNames: missing.map((m) => m.test_name),
    };
  }
  let min = Number.POSITIVE_INFINITY;
  let minName = "";
  for (const i of items) {
    const d = getCriticalStabilityDays(i);
    if (d != null && d < min) {
      min = d;
      minName = i.test_name;
    }
  }
  return { kind: "complete", minDays: min, minDaysTestName: minName };
}

export type ShipTempSummary =
  | { kind: "empty" }
  | { kind: "complete"; strictest: ShipTemp }
  | { kind: "missing"; missingNames: string[] };

export function summarizeShipTemp(items: StabilityItem[]): ShipTempSummary {
  if (items.length === 0) return { kind: "empty" };
  const missing = items.filter((i) => !i.ship_temp);
  if (missing.length > 0) {
    return {
      kind: "missing",
      missingNames: missing.map((m) => m.test_name),
    };
  }
  let strictest: ShipTemp = "ambient_only";
  let strictestRank = 0;
  for (const i of items) {
    const rank = SHIP_TEMP_STRICTNESS[i.ship_temp as ShipTemp] ?? 0;
    if (rank > strictestRank) {
      strictestRank = rank;
      strictest = i.ship_temp as ShipTemp;
    }
  }
  return { kind: "complete", strictest };
}

/**
 * Tests in the cart that are incomplete by the ship_temp + stability
 * definition (NULL ship_temp, NULL stability_days, or
 * refrigerated_or_frozen without a frozen value).
 */
export function testsWithMissingData(items: StabilityItem[]): string[] {
  return items.filter(isShippingIncomplete).map((i) => i.test_name);
}
