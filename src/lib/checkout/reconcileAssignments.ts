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

import type { CartItem } from "@/components/catalogue/types";
import type { PersonAssignmentEntry } from "@/components/checkout/Step2AssignTests";

/**
 * Rebuilds `assignments` so it exactly covers the test items in the
 * cart, honouring existing per-person choices where valid.
 *
 *   • personCount === 1 → canonical form: every cart test at person 0.
 *     Any prior choices are ignored (they're meaningless at count=1).
 *
 *   • personCount > 1 → preserve prior entries where the test is still
 *     in the cart AND the person_index is in range. Tests in the cart
 *     that have no valid prior entry are added at person 0 (the user
 *     can re-split in Step 2). Prior entries whose test_id isn't in
 *     the cart are dropped.
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
    (i): i is CartItem & { line_type: "test" } => i.line_type === "test"
  );
  const clampedCount = Math.max(1, personCount);

  if (clampedCount === 1) {
    // Canonical single-person form — cart drives the list entirely.
    return cartTests.map((t) => ({
      test_id: t.test_id,
      test_name: t.test_name,
      lab_name: t.lab_name,
      price_cad: t.price_cad,
      person_index: 0,
    }));
  }

  // Multi-person: preserve user-made splits where still valid.
  const prevByTestId = new Map<string, PersonAssignmentEntry>();
  for (const a of prev) {
    // Last write wins if somehow the prev array has duplicates.
    prevByTestId.set(a.test_id, a);
  }
  return cartTests.map((t) => {
    const prior = prevByTestId.get(t.test_id);
    const personIndex =
      prior && prior.person_index >= 0 && prior.person_index < clampedCount
        ? prior.person_index
        : 0;
    return {
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
      missingTestIds: string[];
      extraTestIds: string[];
    };

/**
 * Defensive gate used on Proceed-to-Payment. Should never fail in
 * normal operation once `reconcileAssignments` is wired into the sync
 * effect — but if somehow the cart and assignments have drifted (race,
 * future regression, localStorage tamper), we want to catch it before
 * a user creates a Stripe session with zero tests rather than after.
 */
export function validateAssignments(
  cart: CartItem[],
  assignments: PersonAssignmentEntry[]
): ValidationResult {
  const cartTestIds = new Set(
    cart
      .filter((i): i is CartItem & { line_type: "test" } => i.line_type === "test")
      .map((t) => t.test_id)
  );
  const assignmentTestIds = new Set(assignments.map((a) => a.test_id));

  const missing = [...cartTestIds].filter((id) => !assignmentTestIds.has(id));
  const extra = [...assignmentTestIds].filter((id) => !cartTestIds.has(id));

  if (missing.length === 0 && extra.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: missing.length > 0 ? "missing_assignments" : "stale_assignments",
    missingTestIds: missing,
    extraTestIds: extra,
  };
}
