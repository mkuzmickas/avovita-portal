/**
 * Single source of truth for rendering a test's handling + stability to
 * users and admins. Every catalogue row, admin cell, quote-composer
 * line, and operational email formats these fields through this module
 * — no inline string building, no duplicate threshold logic.
 */

export type HandlingType =
  | "refrigerated_only"
  | "frozen_only"
  | "ambient_only"
  | "refrigerated_or_frozen";

export const HANDLING_TYPE_VALUES: HandlingType[] = [
  "refrigerated_only",
  "frozen_only",
  "ambient_only",
  "refrigerated_or_frozen",
];

export const HANDLING_TYPE_LABELS: Record<HandlingType, string> = {
  refrigerated_only: "Refrigerated only",
  frozen_only: "Frozen only",
  ambient_only: "Ambient only",
  refrigerated_or_frozen: "Refrigerated or Frozen",
};

/**
 * Strictness ranking used when summarising the strictest handling
 * across a cart of tests. Higher wins.
 *
 *   ambient_only            (1)  easiest — no cold chain
 *   refrigerated_or_frozen  (2)  flexible; at minimum refrigerated
 *   refrigerated_only       (3)  must be refrigerated
 *   frozen_only             (4)  must be frozen — hardest
 */
export const HANDLING_STRICTNESS: Record<HandlingType, number> = {
  ambient_only: 1,
  refrigerated_or_frozen: 2,
  refrigerated_only: 3,
  frozen_only: 4,
};

export interface HandlingFields {
  handling_type: HandlingType | null;
  stability_days: number | null;
  stability_days_frozen: number | null;
}

export const STABILITY_NOT_SET = "\u26A0 Stability not set";
export const HANDLING_NOT_SET = "\u26A0 Handling not set";

/**
 * Returns the customer-facing stability sentence. Every missing-data
 * path resolves to the same warning string so UI code never has to
 * branch on NULL again.
 */
export function formatStability(test: HandlingFields): string {
  if (!test.handling_type || test.stability_days == null) {
    return STABILITY_NOT_SET;
  }
  switch (test.handling_type) {
    case "refrigerated_only":
      return `Stable ${test.stability_days} days refrigerated`;
    case "frozen_only":
      return `Stable ${test.stability_days} days frozen`;
    case "ambient_only":
      return `Stable ${test.stability_days} days ambient`;
    case "refrigerated_or_frozen":
      if (test.stability_days_frozen == null) return STABILITY_NOT_SET;
      return `Stable ${test.stability_days} days refrigerated / ${test.stability_days_frozen} days frozen`;
  }
}

export function formatHandling(handling_type: HandlingType | null): string {
  if (!handling_type) return HANDLING_NOT_SET;
  return HANDLING_TYPE_LABELS[handling_type];
}

/**
 * Worst-case stability window — the number to colour-code a row against
 * and to drive red/yellow/green thresholds. For refrigerated_or_frozen
 * tests this deliberately returns the REFRIGERATED window (the shorter
 * of the two, since a courier shipping refrigerated has to arrive in
 * that time). Frozen transport buys the longer frozen window separately.
 */
export function getCriticalStabilityDays(
  test: Pick<HandlingFields, "handling_type" | "stability_days">
): number | null {
  if (!test.handling_type || test.stability_days == null) return null;
  return test.stability_days;
}

/**
 * Red ≤ 5 days, Yellow 6–10, Green ≥ 11. Reads the critical (worst-case)
 * stability value — refrigerated_or_frozen tests with 3 days refrigerated
 * / 30 days frozen still colour red.
 */
export function stabilityColorForTest(
  test: Pick<HandlingFields, "handling_type" | "stability_days">
): string | null {
  const days = getCriticalStabilityDays(test);
  if (days == null) return null;
  if (days <= 5) return "#dc2626";
  if (days <= 10) return "#f59e0b";
  return "#16a34a";
}

/**
 * True when a test is incomplete by the new definition — drives the
 * admin "missing data" filter and the per-row warning icon.
 */
export function isHandlingIncomplete(test: HandlingFields): boolean {
  if (!test.handling_type) return true;
  if (test.stability_days == null) return true;
  if (
    test.handling_type === "refrigerated_or_frozen" &&
    test.stability_days_frozen == null
  ) {
    return true;
  }
  return false;
}

export const MISSING_DATA_COLOR = "#f97316";
