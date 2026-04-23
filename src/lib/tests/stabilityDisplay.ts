/**
 * Short-form stability label for dense admin views and the FloLabs
 * requisition email. Uses the letter prefix convention:
 *
 *   refrigerated_only,       days=14          → "R14"
 *   frozen_only,             days=30          → "F30"
 *   ambient_only,            days=7           → "A7"
 *   refrigerated_or_frozen,  30/30            → "R30/F30"
 *   refrigerated_or_frozen,  30/null          → "R30/null"
 *   refrigerated_or_frozen,  null/F30         → "null/F30"
 *   refrigerated_or_frozen,  null/null        → "null"
 *   ship_temp=null OR stability_days=null     → "null"
 *
 * The literal "null" string is intentional per the in-progress manual
 * backfill — incomplete catalogue records must stay visibly incomplete
 * in FloLabs emails rather than getting silently formatted as "—".
 * The long-form customer-facing label lives in formatStability
 * (shipTempDisplay.ts), which produces warnings instead of "null".
 */

import type { ShipTempFields } from "./shipTempDisplay";

export function formatStabilityShort(test: ShipTempFields): string {
  if (!test.ship_temp) return "null";

  switch (test.ship_temp) {
    case "refrigerated_only":
      return test.stability_days != null ? `R${test.stability_days}` : "null";
    case "frozen_only":
      return test.stability_days != null ? `F${test.stability_days}` : "null";
    case "ambient_only":
      return test.stability_days != null ? `A${test.stability_days}` : "null";
    case "refrigerated_or_frozen": {
      const r = test.stability_days;
      const f = test.stability_days_frozen;
      // Both sides missing → treat as fully null (no partial info).
      if (r == null && f == null) return "null";
      const rPart = r != null ? `R${r}` : "null";
      const fPart = f != null ? `F${f}` : "null";
      return `${rPart}/${fPart}`;
    }
  }
}
