/**
 * Regression guard for the multi-person same-test bug (Jun 2026).
 *
 * Two customers in two days reported that adding the same test
 * (e.g. Vitamin D) to multiple people on the same order was
 * impossible: the second click on "Person 2" either replaced
 * Person 1's assignment or silently did nothing. Root cause was
 * the catalogue path producing cart rows with no instance_id; the
 * cart's commitAdd dedup key collapsed two clicks of the same
 * test into a single row. The fix (Option B): Step 2 owns the
 * cloning — checking a person's checkbox adds a cart row + an
 * assignment for that (test, person) pair; unchecking removes
 * both. Tests below simulate that handler's state machine over
 * cart + assignments arrays.
 *
 * The downstream contract (reconcileAssignments, materialise,
 * Stripe line build) is unchanged — each cart row maps 1-to-1 to
 * one assignment, one order_lines row, one Stripe line. These
 * tests therefore lock down the cart/assignment shape AFTER the
 * Step 2 handler runs.
 */

import { describe, expect, it } from "vitest";
import { reconcileAssignments } from "@/lib/checkout/reconcileAssignments";
import type { CartItem } from "@/components/catalogue/types";
import type { PersonAssignmentEntry } from "@/components/checkout/Step2AssignTests";

// ─── Test fixtures + handler simulation ───────────────────────────────────

function testItem(
  test_id: string,
  opts: { name?: string; price?: number; instance_id?: string } = {},
): CartItem {
  return {
    line_type: "test",
    test_id,
    test_name: opts.name ?? `Test ${test_id}`,
    lab_name: "Mayo Clinic Laboratories",
    price_cad: opts.price ?? 50,
    quantity: 1,
    instance_id: opts.instance_id,
  };
}

/**
 * Simulates the Step 2 togglePersonForTest handler. Returns the
 * resulting cart + assignments arrays after the toggle. The real
 * component calls addCartItem / removeCartItem / onAssignmentsChange;
 * here we operate directly on the array state to make the contract
 * pure and testable.
 */
function togglePersonForTest(
  cart: CartItem[],
  assignments: PersonAssignmentEntry[],
  test_id: string,
  person_index: number,
  cloneInstanceId: string,
): { cart: CartItem[]; assignments: PersonAssignmentEntry[] } {
  const existing = assignments.find(
    (a) => a.test_id === test_id && a.person_index === person_index,
  );
  if (existing) {
    // UNCHECK — drop both the cart row and the assignment.
    return {
      cart: cart.filter(
        (item) =>
          !(
            item.line_type === "test" &&
            (item.instance_id ?? item.test_id) === existing.instance_id
          ),
      ),
      assignments: assignments.filter(
        (a) => a.instance_id !== existing.instance_id,
      ),
    };
  }
  // CHECK — clone the row from a sample and add an assignment.
  const sample = cart.find(
    (item): item is CartItem & { line_type: "test" } =>
      item.line_type === "test" && item.test_id === test_id,
  );
  if (!sample) return { cart, assignments };
  return {
    cart: [
      ...cart,
      {
        ...sample,
        instance_id: cloneInstanceId,
      } as CartItem,
    ],
    assignments: [
      ...assignments,
      {
        instance_id: cloneInstanceId,
        test_id: sample.test_id,
        test_name: sample.test_name,
        lab_name: sample.lab_name,
        price_cad: sample.price_cad,
        person_index,
      },
    ],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("multi-person same-test cart state machine", () => {
  it("single-person order: one test, one assignment, no change", () => {
    // Customer adds Vitamin D from /tests catalogue → 1 cart row, no
    // instance_id. Reconcile (called once) assigns it to person 0.
    const cart: CartItem[] = [testItem("vitd")];
    const reconciled = reconcileAssignments(cart, 1, []);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].person_index).toBe(0);
    expect(cart).toHaveLength(1);
  });

  it("two-person order, customer assigns Vitamin D to BOTH people", () => {
    // Start: customer added Vitamin D from catalogue, picked 2 people.
    // After reconcile, the initial row defaults to person 0.
    let cart: CartItem[] = [testItem("vitd")];
    let assignments = reconcileAssignments(cart, 2, []);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].person_index).toBe(0);

    // Step 2: customer checks Person 2 on Vitamin D.
    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "vitd",
      1,
      "step2:vitd:clone-a",
    ));

    expect(cart).toHaveLength(2);
    expect(assignments).toHaveLength(2);
    expect(assignments.map((a) => a.person_index).sort()).toEqual([0, 1]);
    expect(assignments.every((a) => a.test_id === "vitd")).toBe(true);
  });

  it("three-person order, customer assigns the same test to all three", () => {
    let cart: CartItem[] = [testItem("vitd")];
    let assignments = reconcileAssignments(cart, 3, []);

    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "vitd",
      1,
      "step2:vitd:clone-1",
    ));
    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "vitd",
      2,
      "step2:vitd:clone-2",
    ));

    expect(cart).toHaveLength(3);
    expect(assignments).toHaveLength(3);
    expect(assignments.map((a) => a.person_index).sort()).toEqual([0, 1, 2]);
  });

  it("two-person order, two different tests one per person", () => {
    // John gets Vitamin D, Jane gets Lipid Panel — no cloning needed,
    // each test goes to one person only.
    let cart: CartItem[] = [testItem("vitd"), testItem("lipid")];
    let assignments = reconcileAssignments(cart, 2, []);

    // reconcile defaults both to person 0; customer moves lipid to person 1.
    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "lipid",
      1,
      "step2:lipid:clone-a",
    ));
    // Now lipid is checked for both — uncheck person 0 to leave only
    // person 1 (the move-rather-than-add case).
    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "lipid",
      0,
      "(unused)",
    ));

    expect(cart).toHaveLength(2);
    expect(assignments).toHaveLength(2);
    const byPerson = new Map<number, string[]>();
    for (const a of assignments) {
      const list = byPerson.get(a.person_index) ?? [];
      list.push(a.test_id);
      byPerson.set(a.person_index, list);
    }
    expect(byPerson.get(0)).toEqual(["vitd"]);
    expect(byPerson.get(1)).toEqual(["lipid"]);
  });

  it("uncheck a person — both cart row and assignment go away", () => {
    let cart: CartItem[] = [testItem("vitd")];
    let assignments = reconcileAssignments(cart, 2, []);

    // Add person 1 (Jane).
    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "vitd",
      1,
      "step2:vitd:jane",
    ));
    expect(cart).toHaveLength(2);

    // Uncheck Jane — both her cart row and her assignment must drop.
    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "vitd",
      1,
      "(unused)",
    ));
    expect(cart).toHaveLength(1);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].person_index).toBe(0);
  });

  it("uncheck the LAST person — test fully removed from cart", () => {
    // If the customer unchecks everyone for a test, the test leaves
    // the cart entirely (no orphan rows).
    let cart: CartItem[] = [testItem("vitd")];
    let assignments = reconcileAssignments(cart, 1, []);
    expect(assignments).toHaveLength(1);

    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "vitd",
      0,
      "(unused)",
    ));
    expect(cart).toHaveLength(0);
    expect(assignments).toHaveLength(0);
  });

  it("multi-person assignment produces N order_lines and N Stripe line items", () => {
    // Two people, both get the same test → two cart rows → two
    // assignments → downstream pipelines (materialise, Stripe checkout)
    // iterate per-assignment so they produce 2 line items.
    const initialCart: CartItem[] = [testItem("vitd", { price: 50 })];
    const initialAssignments = reconcileAssignments(initialCart, 2, []);
    const { assignments } = togglePersonForTest(
      initialCart,
      initialAssignments,
      "vitd",
      1,
      "step2:vitd:p1",
    );

    // Equivalent to what materialise.ts does (assignments.map → insert).
    const orderLines = assignments.map((a) => ({
      test_id: a.test_id,
      profile_index: a.person_index,
      unit_price_cad: a.price_cad,
    }));
    expect(orderLines).toHaveLength(2);
    expect(orderLines.every((l) => l.test_id === "vitd")).toBe(true);
    // Each person has their own line, each at full price (50 + 50 = 100).
    expect(orderLines.reduce((s, l) => s + l.unit_price_cad, 0)).toBe(100);
  });

  it("multi-test discount counts per assignment, not per unique test", () => {
    // Vitamin D for two people = 2 cart rows = 2 "lines" for discount
    // purposes — consistent with discount.ts which counts cart entries.
    let cart: CartItem[] = [testItem("vitd")];
    let assignments = reconcileAssignments(cart, 2, []);
    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "vitd",
      1,
      "step2:vitd:p1",
    ));
    // cart length is what computeDiscount() sees.
    expect(cart.filter((c) => c.line_type === "test")).toHaveLength(2);
  });

  it("regression: cart row without instance_id (catalogue add path) can still be cloned", () => {
    // Bug surface from production: catalogue adds carry NO instance_id,
    // so instanceKey falls back to test_id. Step 2 clones with a fresh
    // step2:* key, and the original row keeps its bare key. The two
    // coexist without dedup collision.
    let cart: CartItem[] = [testItem("vitd")]; // no instance_id
    let assignments = reconcileAssignments(cart, 2, []);
    ({ cart, assignments } = togglePersonForTest(
      cart,
      assignments,
      "vitd",
      1,
      "step2:vitd:fresh",
    ));
    const testRows = cart.filter(
      (item): item is CartItem & { line_type: "test" } =>
        item.line_type === "test",
    );
    const keys = new Set(
      testRows.map((r) => r.instance_id ?? r.test_id),
    );
    expect(keys.size).toBe(2);
    expect(keys.has("vitd")).toBe(true);
    expect(keys.has("step2:vitd:fresh")).toBe(true);
  });
});
