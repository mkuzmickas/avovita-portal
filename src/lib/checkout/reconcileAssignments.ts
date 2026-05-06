/**
 * Single source of truth for the checkout wizard's `assignments` state.
 *
 * `assignments` maps each test in the cart to a person index (0-based).
 * Without a reconciliation step, the array drifts out of sync with the
 * cart — the bug that caused Step 4 to show "Tests subtotal (0 lines)"
 * while the right-pane cart summary rendered correctly. Every write to
 * `assignments` should flow through `reconcileAssignments`; every submit
 * should call `validateAssignments` before hitting Stripe.
 */

import type { CartItem, CartItemTest } from "@/components/catalogue/types";
import type { PersonAssignmentEntry } from "@/components/checkout/Step2AssignTests";

/** Stable per-cart-row key. Falls back to test_id for cart rows that
 *  predate the instance_id field — those are guaranteed unique by
 *  test_id because the cart's commitAdd dedupes on the same key. */
function rowKey(t: CartItemTest): string {
  return t.instance_id ?? t.test_id;
}

/**
 * Rebuilds `assignments` so it exactly covers the test rows in the
 * cart, honouring existing per-person choices where valid.
 *
 *   • personCount === 1 → canonical form: every cart row at person 0.
 *     Any prior choices are ignored (they're meaningless at count=1).
 *
 *   • personCount > 1 → preserve prior entries where the row is still
 *     in the cart AND the person_index is in range. Rows in the cart
 *     that have no valid prior entry are added at person 0 (the user
 *     can re-split in Step 2). Prior entries whose instance_id isn't
 *     in the cart are dropped.
 *
 * Each cart row gets its own assignment, so two rows with the same
 * test_id (multi-person quote) coexist as separate assignments keyed
 * by instance_id.
 *
 * The function is pure: same inputs always produce the same output.
 * Call it from the useEffect sync in CheckoutClient whenever cart,
 * personCount, or restore state changes.
 */
export function reconcileAssignments(
  cart: CartItem[],
  personCount: number,
  prev: PersonAssignmentEntry[]
): PersonAssignmentEntry[] {
  const cartTests = cart.filter(
    (i): i is CartItemTest => i.line_type === "test"
  );
  const clampedCount = Math.max(1, personCount);

  if (clampedCount === 1) {
    // Canonical single-person form — cart drives the list entirely.
    return cartTests.map((t) => ({
      instance_id: rowKey(t),
      test_id: t.test_id,
      test_name: t.test_name,
      lab_name: t.lab_name,
      price_cad: t.price_cad,
      person_index: 0,
    }));
  }

  // Multi-person: preserve user-made splits where still valid. Match
  // on instance_id so two cart rows with the same test_id keep
  // independent person assignments.
  const prevByInstance = new Map<string, PersonAssignmentEntry>();
  for (const a of prev) {
    prevByInstance.set(a.instance_id, a);
  }
  return cartTests.map((t) => {
    const key = rowKey(t);
    const prior = prevByInstance.get(key);
    const personIndex =
      prior && prior.person_index >= 0 && prior.person_index < clampedCount
        ? prior.person_index
        : 0;
    return {
      instance_id: key,
      test_id: t.test_id,
      test_name: t.test_name,
      lab_name: t.lab_name,
      price_cad: t.price_cad,
      person_index: personIndex,
    };
  });
}

export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_assignments" | "stale_assignments";
      missingInstanceIds: string[];
      extraInstanceIds: string[];
    };

/**
 * Defensive gate used on Proceed-to-Payment. Should never fail in
 * normal operation once `reconcileAssignments` is wired into the sync
 * effect — but if somehow the cart and assignments have drifted (race,
 * future regression, localStorage tamper), we want to catch it before
 * a user creates a Stripe session with zero tests rather than after.
 *
 * Compares by instance_id (with test_id fallback) so multi-line quote
 * carts where two rows share a test_id are validated row-by-row.
 */
export function validateAssignments(
  cart: CartItem[],
  assignments: PersonAssignmentEntry[]
): ValidationResult {
  const cartInstanceIds = new Set(
    cart
      .filter((i): i is CartItemTest => i.line_type === "test")
      .map(rowKey)
  );
  const assignmentInstanceIds = new Set(
    assignments.map((a) => a.instance_id)
  );

  const missing = [...cartInstanceIds].filter(
    (id) => !assignmentInstanceIds.has(id)
  );
  const extra = [...assignmentInstanceIds].filter(
    (id) => !cartInstanceIds.has(id)
  );

  if (missing.length === 0 && extra.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: missing.length > 0 ? "missing_assignments" : "stale_assignments",
    missingInstanceIds: missing,
    extraInstanceIds: extra,
  };
}
