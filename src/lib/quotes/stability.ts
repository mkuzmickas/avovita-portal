/**
 * Stability + handling helpers for the quote composer.
 *
 * Missing data is intentionally surfaced, never defaulted. Every helper
 * distinguishes "have value" from "NULL" so the UI can render an explicit
 * warning instead of a silent fallback.
 */

export type ShipTemperature =
  | "ambient"
  | "refrigerated"
  | "frozen"
  | "warm_37c"
  | "cold_chain";

export const SHIP_TEMPERATURE_VALUES: ShipTemperature[] = [
  "ambient",
  "refrigerated",
  "frozen",
  "warm_37c",
  "cold_chain",
];

const TEMPERATURE_LABEL: Record<ShipTemperature, string> = {
  ambient: "Ambient",
  refrigerated: "Refrigerated",
  frozen: "Frozen",
  warm_37c: "Warm (37°C)",
  cold_chain: "Cold chain",
};

/**
 * Strictness ranking per spec: warm_37c > frozen > cold_chain >
 * refrigerated > ambient. Higher number = stricter.
 */
const TEMPERATURE_STRICTNESS: Record<ShipTemperature, number> = {
  ambient: 1,
  refrigerated: 2,
  cold_chain: 3,
  frozen: 4,
  warm_37c: 5,
};

export function shipTemperatureLabel(value: string | null): string | null {
  if (!value) return null;
  if ((SHIP_TEMPERATURE_VALUES as string[]).includes(value)) {
    return TEMPERATURE_LABEL[value as ShipTemperature];
  }
  return value;
}

/** Red ≤ 5 days, Yellow 6–10, Green ≥ 11. */
export function stabilityColor(days: number): string {
  if (days <= 5) return "#dc2626";
  if (days <= 10) return "#f59e0b";
  return "#16a34a";
}

export const MISSING_DATA_COLOR = "#f97316";

export type StabilityItem = {
  test_id: string;
  test_name: string;
  stability_days: number | null;
  ship_temperature: string | null;
};

export type StabilitySummary =
  | {
      kind: "empty";
    }
  | {
      kind: "complete";
      minDays: number;
      minDaysTestName: string;
    }
  | {
      kind: "missing";
      missingNames: string[];
    };

export function summarizeStability(items: StabilityItem[]): StabilitySummary {
  if (items.length === 0) return { kind: "empty" };
  const missing = items.filter((i) => i.stability_days == null);
  if (missing.length > 0) {
    return {
      kind: "missing",
      missingNames: missing.map((m) => m.test_name),
    };
  }
  let min = Number.POSITIVE_INFINITY;
  let minName = "";
  for (const i of items) {
    const d = i.stability_days as number;
    if (d < min) {
      min = d;
      minName = i.test_name;
    }
  }
  return { kind: "complete", minDays: min, minDaysTestName: minName };
}

export type HandlingSummary =
  | { kind: "empty" }
  | { kind: "complete"; strictest: ShipTemperature }
  | { kind: "missing"; missingNames: string[] };

export function summarizeHandling(items: StabilityItem[]): HandlingSummary {
  if (items.length === 0) return { kind: "empty" };
  const missing = items.filter((i) => !i.ship_temperature);
  if (missing.length > 0) {
    return {
      kind: "missing",
      missingNames: missing.map((m) => m.test_name),
    };
  }
  let strictest: ShipTemperature = "ambient";
  let strictestRank = 0;
  for (const i of items) {
    const v = i.ship_temperature as ShipTemperature;
    const rank = TEMPERATURE_STRICTNESS[v] ?? 0;
    if (rank > strictestRank) {
      strictestRank = rank;
      strictest = v;
    }
  }
  return { kind: "complete", strictest };
}

/** Tests in the cart that have NULL stability_days OR NULL ship_temperature. */
export function testsWithMissingData(items: StabilityItem[]): string[] {
  const names: string[] = [];
  for (const i of items) {
    if (i.stability_days == null || !i.ship_temperature) {
      names.push(i.test_name);
    }
  }
  return names;
}
