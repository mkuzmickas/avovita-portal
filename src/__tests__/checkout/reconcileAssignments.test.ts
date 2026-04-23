/**
 * Regression guard for the Step 4 "0 lines" bug.
 *
 * The bug was caused by `assignments` only ever being populated on
 * Step 1 Continue, while Step 4 read from `assignments` (left pane)
 * AND the cart (right pane). Any cart change that bypassed Step 1 —
 * quote-accept deep-link, page reload at a later step, cart addition
 * from another tab — left the two sources disagreeing.
 *
 * `reconcileAssignments` is the single function that keeps them in
 * sync. These tests cover every path that triggered the original bug
 * plus the multi-person cases the production UI depends on.
 */

import { describe, expect, it } from "vitest";
import {
  reconcileAssignments,
  validateAssignments,
} from "@/lib/checkout/reconcileAssignments";
import type { CartItem } from "@/components/catalogue/types";
import type { PersonAssignmentEntry } from "@/components/checkout/Step2AssignTests";

function testItem(
  test_id: string,
  opts: { name?: string; price?: number; lab?: string } = {}
): CartItem {
  return {
    line_type: "test",
    test_id,
    test_name: opts.name ?? `Test ${test_id}`,
    lab_name: opts.lab ?? "Mayo Clinic Laboratories",
    price_cad: opts.price ?? 150,
    quantity: 1,
  };
}

function supplementItem(id: string): CartItem {
  return {
    line_type: "supplement",
    supplement_id: id,
    sku: `SUP-${id}`,
    name: `Supplement ${id}`,
    price_cad: 40,
    quantity: 1,
  };
}

describe("reconcileAssignments", () => {
  it("empty cart + empty prev → empty", () => {
    expect(reconcileAssignments([], 1, [])).toEqual([]);
  });

  it("one cart test at personCount=1 with no prev → one assignment at person 0", () => {
    const cart = [testItem("t1", { name: "Vit D", price: 150 })];
    const out = reconcileAssignments(cart, 1, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      test_id: "t1",
      test_name: "Vit D",
      price_cad: 150,
      person_index: 0,
    });
  });

  it("three cart tests at personCount=1 all land at person 0 regardless of prev", () => {
    const cart = [testItem("t1"), testItem("t2"), testItem("t3")];
    // Simulate stale prev from a prior multi-person session.
    const prev: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "a", lab_name: "x", price_cad: 1, person_index: 1 },
      { test_id: "t2", test_name: "b", lab_name: "x", price_cad: 1, person_index: 2 },
    ];
    const out = reconcileAssignments(cart, 1, prev);
    expect(out).toHaveLength(3);
    for (const a of out) expect(a.person_index).toBe(0);
  });

  it("reproduces the original symptom: cart has tests, prev is empty, personCount=1", () => {
    // This is the exact bug — quote-accept deep-link populates cart
    // without going through Step 1, so assignments sits at [].
    const cart = [testItem("t1"), testItem("t2"), testItem("t3")];
    const out = reconcileAssignments(cart, 1, []);
    expect(out).toHaveLength(3);
    expect(out.map((a) => a.test_id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("multi-person: preserves prior splits where still valid", () => {
    const cart = [testItem("t1"), testItem("t2"), testItem("t3")];
    const prev: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "a", lab_name: "x", price_cad: 1, person_index: 0 },
      { test_id: "t2", test_name: "b", lab_name: "x", price_cad: 1, person_index: 1 },
      { test_id: "t3", test_name: "c", lab_name: "x", price_cad: 1, person_index: 1 },
    ];
    const out = reconcileAssignments(cart, 2, prev);
    expect(out).toHaveLength(3);
    const byId = new Map(out.map((a) => [a.test_id, a.person_index]));
    expect(byId.get("t1")).toBe(0);
    expect(byId.get("t2")).toBe(1);
    expect(byId.get("t3")).toBe(1);
  });

  it("multi-person: new cart tests land at person 0", () => {
    const cart = [testItem("t1"), testItem("t2"), testItem("t3")];
    const prev: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "a", lab_name: "x", price_cad: 1, person_index: 1 },
    ];
    const out = reconcileAssignments(cart, 2, prev);
    expect(out).toHaveLength(3);
    const byId = new Map(out.map((a) => [a.test_id, a.person_index]));
    expect(byId.get("t1")).toBe(1); // preserved
    expect(byId.get("t2")).toBe(0); // newly added
    expect(byId.get("t3")).toBe(0); // newly added
  });

  it("multi-person: drops prev entries whose test_id is no longer in cart", () => {
    const cart = [testItem("t1")];
    const prev: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "a", lab_name: "x", price_cad: 1, person_index: 0 },
      { test_id: "stale", test_name: "x", lab_name: "x", price_cad: 1, person_index: 1 },
    ];
    const out = reconcileAssignments(cart, 2, prev);
    expect(out).toHaveLength(1);
    expect(out[0].test_id).toBe("t1");
  });

  it("multi-person: clamps out-of-range person_index back to 0", () => {
    // Simulates personCount going from 3 to 2 — the test assigned to
    // person 2 no longer has a valid slot.
    const cart = [testItem("t1"), testItem("t2")];
    const prev: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "a", lab_name: "x", price_cad: 1, person_index: 0 },
      { test_id: "t2", test_name: "b", lab_name: "x", price_cad: 1, person_index: 2 },
    ];
    const out = reconcileAssignments(cart, 2, prev);
    const byId = new Map(out.map((a) => [a.test_id, a.person_index]));
    expect(byId.get("t1")).toBe(0);
    expect(byId.get("t2")).toBe(0);
  });

  it("ignores non-test cart items (supplements, resources)", () => {
    const cart = [testItem("t1"), supplementItem("s1")];
    const out = reconcileAssignments(cart, 1, []);
    expect(out).toHaveLength(1);
    expect(out[0].test_id).toBe("t1");
  });

  it("snapshot price + name + lab from cart, not stale prev", () => {
    // If a test's price changed between sessions, we snapshot from cart.
    const cart = [testItem("t1", { name: "Renamed", price: 199 })];
    const prev: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "Old", lab_name: "Old", price_cad: 100, person_index: 0 },
    ];
    const out = reconcileAssignments(cart, 1, prev);
    expect(out[0].price_cad).toBe(199);
    expect(out[0].test_name).toBe("Renamed");
  });
});

describe("validateAssignments", () => {
  it("passes when assignments match cart 1:1", () => {
    const cart = [testItem("t1"), testItem("t2")];
    const assignments: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "a", lab_name: "x", price_cad: 1, person_index: 0 },
      { test_id: "t2", test_name: "b", lab_name: "x", price_cad: 1, person_index: 0 },
    ];
    expect(validateAssignments(cart, assignments)).toEqual({ ok: true });
  });

  it("passes for empty-cart empty-assignments", () => {
    expect(validateAssignments([], [])).toEqual({ ok: true });
  });

  it("fails with missing_assignments when cart has a test not in assignments", () => {
    // The production symptom: this is what would have fired if the
    // submit gate had existed during the zero-line bug.
    const cart = [testItem("t1"), testItem("t2")];
    const assignments: PersonAssignmentEntry[] = [];
    const result = validateAssignments(cart, assignments);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("missing_assignments");
    expect(result.missingTestIds.sort()).toEqual(["t1", "t2"]);
  });

  it("fails with stale_assignments when assignments have a test not in cart", () => {
    const cart = [testItem("t1")];
    const assignments: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "a", lab_name: "x", price_cad: 1, person_index: 0 },
      { test_id: "stale", test_name: "x", lab_name: "x", price_cad: 1, person_index: 0 },
    ];
    const result = validateAssignments(cart, assignments);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("stale_assignments");
    expect(result.extraTestIds).toEqual(["stale"]);
  });

  it("ignores non-test cart items when validating", () => {
    const cart = [testItem("t1"), supplementItem("s1")];
    const assignments: PersonAssignmentEntry[] = [
      { test_id: "t1", test_name: "a", lab_name: "x", price_cad: 1, person_index: 0 },
    ];
    expect(validateAssignments(cart, assignments)).toEqual({ ok: true });
  });
});
