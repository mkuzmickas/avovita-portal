/**
 * Single source of truth for rendering a test's ship_temp + stability
 * to users and admins. Every catalogue row, admin cell, quote-composer
 * line, and operational email formats these fields through this
 * module — no inline string building, no duplicate threshold logic.
 *
 * (Renamed from handlingDisplay.ts in migration 019 — the field was
 * mis-named handling_type originally; it's a ship-temperature
 * requirement, so the code mirrors the DB rename.)
 */

export type ShipTemp =
  | "refrigerated_only"
  | "frozen_only"
  | "ambient_only"
  | "refrigerated_or_frozen";

export const SHIP_TEMP_VALUES: ShipTemp[] = [
  "refrigerated_only",
  "frozen_only",
  "ambient_only",
  "refrigerated_or_frozen",
];

/** Full labels — customer-facing detail panes and admin edit form. */
export const SHIP_TEMP_LABELS: Record<ShipTemp, string> = {
  refrigerated_only: "Refrigerated only",
  frozen_only: "Frozen only",
  ambient_only: "Ambient only",
  refrigerated_or_frozen: "Refrigerated or Frozen",
};

/** Compact labels — admin list cell where horizontal space is tight. */
export const SHIP_TEMP_SHORT_LABELS: Record<ShipTemp, string> = {
  refrigerated_only: "Refrig",
  frozen_only: "Frozen",
  ambient_only: "Ambient",
  refrigerated_or_frozen: "Refrig or Frozen",
};

/**
 * Strictness ranking used when summarising the strictest ship_temp
 * across a cart of tests. Higher wins.
 *
 *   ambient_only            (1)  easiest — no cold chain
 *   refrigerated_or_frozen  (2)  flexible; at minimum refrigerated
 *   refrigerated_only       (3)  must be refrigerated
 *   frozen_only             (4)  must be frozen — hardest
 */
export const SHIP_TEMP_STRICTNESS: Record<ShipTemp, number> = {
  ambient_only: 1,
  refrigerated_or_frozen: 2,
  refrigerated_only: 3,
  frozen_only: 4,
};

export interface ShipTempFields {
  ship_temp: ShipTemp | null;
  stability_days: number | null;
  stability_days_frozen: number | null;
}

export const STABILITY_NOT_SET = "⚠ Stability not set";
export const SHIP_TEMP_NOT_SET = "⚠ Ship temp not set";

/**
 * Returns the customer-facing stability sentence. Every missing-data
 * path resolves to the same warning string so UI code never has to
 * branch on NULL again.
 */
export function formatStability(test: ShipTempFields): string {
  if (!test.ship_temp || test.stability_days == null) {
    return STABILITY_NOT_SET;
  }
  switch (test.ship_temp) {
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

/** Full label — customer-facing detail panes + admin edit form. */
export function formatShipTempLong(ship_temp: ShipTemp | null): string {
  if (!ship_temp) return SHIP_TEMP_NOT_SET;
  return SHIP_TEMP_LABELS[ship_temp];
}

/** Short label — admin list cell where "Refrigerated or Frozen" won't fit. */
export function formatShipTempShort(ship_temp: ShipTemp | null): string {
  if (!ship_temp) return SHIP_TEMP_NOT_SET;
  return SHIP_TEMP_SHORT_LABELS[ship_temp];
}

/**
 * Worst-case stability window — the number to colour-code a row against
 * and to drive red/yellow/green thresholds. For refrigerated_or_frozen
 * tests this deliberately returns the REFRIGERATED window (the shorter
 * of the two, since a courier shipping refrigerated has to arrive in
 * that time). Frozen transport buys the longer frozen window separately.
 */
export function getCriticalStabilityDays(
  test: Pick<ShipTempFields, "ship_temp" | "stability_days">
): number | null {
  if (!test.ship_temp || test.stability_days == null) return null;
  return test.stability_days;
}

/**
 * Red ≤ 5 days, Yellow 6–10, Green ≥ 11. Reads the critical (worst-case)
 * stability value — refrigerated_or_frozen tests with 3 days refrigerated
 * / 30 days frozen still colour red.
 */
export function stabilityColorForTest(
  test: Pick<ShipTempFields, "ship_temp" | "stability_days">
): string | null {
  const days = getCriticalStabilityDays(test);
  if (days == null) return null;
  if (days <= 5) return "#dc2626";
  if (days <= 10) return "#f59e0b";
  return "#16a34a";
}

/**
 * True when a test's shipping info is incomplete — drives the admin
 * "missing data" filter and the per-row warning icon.
 */
export function isShippingIncomplete(test: ShipTempFields): boolean {
  if (!test.ship_temp) return true;
  if (test.stability_days == null) return true;
  if (
    test.ship_temp === "refrigerated_or_frozen" &&
    test.stability_days_frozen == null
  ) {
    return true;
  }
  return false;
}

export const MISSING_DATA_COLOR = "#f97316";
