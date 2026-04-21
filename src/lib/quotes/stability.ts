/**
 * Quote-composer summaries for stability + handling.
 *
 * All rendering goes through `src/lib/tests/handlingDisplay.ts`. This
 * file is only responsible for aggregating across a cart: finding the
 * earliest stability limit, the strictest handling, and the list of
 * tests with missing data.
 */

import {
  HANDLING_STRICTNESS,
  MISSING_DATA_COLOR,
  formatHandling,
  formatStability,
  getCriticalStabilityDays,
  isHandlingIncomplete,
  stabilityColorForTest,
  type HandlingType,
} from "@/lib/tests/handlingDisplay";

export {
  MISSING_DATA_COLOR,
  formatHandling,
  formatStability,
  getCriticalStabilityDays,
  isHandlingIncomplete,
  stabilityColorForTest,
};
export type { HandlingType };

export type StabilityItem = {
  test_id: string;
  test_name: string;
  handling_type: HandlingType | null;
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
  const missing = items.filter(isHandlingIncomplete);
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

export type HandlingSummary =
  | { kind: "empty" }
  | { kind: "complete"; strictest: HandlingType }
  | { kind: "missing"; missingNames: string[] };

export function summarizeHandling(items: StabilityItem[]): HandlingSummary {
  if (items.length === 0) return { kind: "empty" };
  const missing = items.filter((i) => !i.handling_type);
  if (missing.length > 0) {
    return {
      kind: "missing",
      missingNames: missing.map((m) => m.test_name),
    };
  }
  let strictest: HandlingType = "ambient_only";
  let strictestRank = 0;
  for (const i of items) {
    const rank = HANDLING_STRICTNESS[i.handling_type as HandlingType] ?? 0;
    if (rank > strictestRank) {
      strictestRank = rank;
      strictest = i.handling_type as HandlingType;
    }
  }
  return { kind: "complete", strictest };
}

/**
 * Tests in the cart that are incomplete by the new handling definition
 * (NULL handling_type, NULL stability_days, or refrigerated_or_frozen
 * without a frozen value).
 */
export function testsWithMissingData(items: StabilityItem[]): string[] {
  return items.filter(isHandlingIncomplete).map((i) => i.test_name);
}
