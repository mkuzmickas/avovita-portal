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
 * plus the multi-person cases the production UI depends on, including
 * the multi-line quote case where two cart rows share a test_id.
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
  opts: {
    name?: string;
    price?: number;
    lab?: string;
    instance_id?: string;
  } = {}
): CartItem {
  return {
    line_type: "test",
    test_id,
    test_name: opts.name ?? `Test ${test_id}`,
    lab_name: opts.lab ?? "Mayo Clinic Laboratories",
    price_cad: opts.price ?? 150,
    quantity: 1,
    instance_id: opts.instance_id,
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

/** PersonAssignmentEntry helper — defaults instance_id to test_id so
 *  tests written before the multi-line feature continue to mean what
 *  they meant before (one cart row per test_id). */
function entry(
  test_id: string,
  person_index: number,
  opts: {
    instance_id?: string;
    test_name?: string;
    lab_name?: string;
    price_cad?: number;
  } = {}
): PersonAssignmentEntry {
  return {
    instance_id: opts.instance_id ?? test_id,
    test_id,
    test_name: opts.test_name ?? "a",
    lab_name: opts.lab_name ?? "x",
    price_cad: opts.price_cad ?? 1,
    person_index,
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
    const prev: PersonAssignmentEntry[] = [
      entry("t1", 1),
      entry("t2", 2),
    ];
    const out = reconcileAssignments(cart, 1, prev);
    expect(out).toHaveLength(3);
    for (const a of out) expect(a.person_index).toBe(0);
  });

  it("reproduces the original symptom: cart has tests, prev is empty, personCount=1", () => {
    const cart = [testItem("t1"), testItem("t2"), testItem("t3")];
    const out = reconcileAssignments(cart, 1, []);
    expect(out).toHaveLength(3);
    expect(out.map((a) => a.test_id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("multi-person: preserves prior splits where still valid", () => {
    const cart = [testItem("t1"), testItem("t2"), testItem("t3")];
    const prev: PersonAssignmentEntry[] = [
      entry("t1", 0),
      entry("t2", 1),
      entry("t3", 1),
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
    const prev: PersonAssignmentEntry[] = [entry("t1", 1)];
    const out = reconcileAssignments(cart, 2, prev);
    expect(out).toHaveLength(3);
    const byId = new Map(out.map((a) => [a.test_id, a.person_index]));
    expect(byId.get("t1")).toBe(1);
    expect(byId.get("t2")).toBe(0);
    expect(byId.get("t3")).toBe(0);
  });

  it("multi-person: drops prev entries whose instance_id is no longer in cart", () => {
    const cart = [testItem("t1")];
    const prev: PersonAssignmentEntry[] = [
      entry("t1", 0),
      entry("stale", 1),
    ];
    const out = reconcileAssignments(cart, 2, prev);
    expect(out).toHaveLength(1);
    expect(out[0].test_id).toBe("t1");
  });

  it("multi-person: clamps out-of-range person_index back to 0", () => {
    const cart = [testItem("t1"), testItem("t2")];
    const prev: PersonAssignmentEntry[] = [
      entry("t1", 0),
      entry("t2", 2),
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
    const cart = [testItem("t1", { name: "Renamed", price: 199 })];
    const prev: PersonAssignmentEntry[] = [
      entry("t1", 0, {
        test_name: "Old",
        lab_name: "Old",
        price_cad: 100,
      }),
    ];
    const out = reconcileAssignments(cart, 1, prev);
    expect(out[0].price_cad).toBe(199);
    expect(out[0].test_name).toBe("Renamed");
  });

  it("multi-line quote: two cart rows for the same test_id keep independent assignments", () => {
    // Use case: a quote sent to a couple where both order the same
    // panel. CheckoutClient's quote-accept loader gives each line a
    // unique instance_id so they survive the cart's commitAdd.
    const cart = [
      testItem("hiv", { instance_id: "AVO-1-line-0" }),
      testItem("hiv", { instance_id: "AVO-1-line-1" }),
    ];
    const out = reconcileAssignments(cart, 2, []);
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.instance_id).sort()).toEqual([
      "AVO-1-line-0",
      "AVO-1-line-1",
    ]);
    // Both default to person 0 (Step 2 lets the user re-split).
    expect(out.every((a) => a.test_id === "hiv")).toBe(true);
  });

  it("multi-line quote: preserves per-instance person assignments across reconcile", () => {
    const cart = [
      testItem("hiv", { instance_id: "AVO-1-line-0" }),
      testItem("hiv", { instance_id: "AVO-1-line-1" }),
    ];
    const prev: PersonAssignmentEntry[] = [
      entry("hiv", 0, { instance_id: "AVO-1-line-0" }),
      entry("hiv", 1, { instance_id: "AVO-1-line-1" }),
    ];
    const out = reconcileAssignments(cart, 2, prev);
    const byInstance = new Map(
      out.map((a) => [a.instance_id, a.person_index])
    );
    expect(byInstance.get("AVO-1-line-0")).toBe(0);
    expect(byInstance.get("AVO-1-line-1")).toBe(1);
  });
});

describe("validateAssignments", () => {
  it("passes when assignments match cart 1:1", () => {
    const cart = [testItem("t1"), testItem("t2")];
    const assignments: PersonAssignmentEntry[] = [
      entry("t1", 0),
      entry("t2", 0),
    ];
    expect(validateAssignments(cart, assignments)).toEqual({ ok: true });
  });

  it("passes for empty-cart empty-assignments", () => {
    expect(validateAssignments([], [])).toEqual({ ok: true });
  });

  it("fails with missing_assignments when cart has a test not in assignments", () => {
    const cart = [testItem("t1"), testItem("t2")];
    const assignments: PersonAssignmentEntry[] = [];
    const result = validateAssignments(cart, assignments);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("missing_assignments");
    expect(result.missingInstanceIds.sort()).toEqual(["t1", "t2"]);
  });

  it("fails with stale_assignments when assignments have a test not in cart", () => {
    const cart = [testItem("t1")];
    const assignments: PersonAssignmentEntry[] = [
      entry("t1", 0),
      entry("stale", 0),
    ];
    const result = validateAssignments(cart, assignments);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("stale_assignments");
    expect(result.extraInstanceIds).toEqual(["stale"]);
  });

  it("ignores non-test cart items when validating", () => {
    const cart = [testItem("t1"), supplementItem("s1")];
    const assignments: PersonAssignmentEntry[] = [entry("t1", 0)];
    expect(validateAssignments(cart, assignments)).toEqual({ ok: true });
  });

  it("multi-line quote: passes when both same-test_id cart rows have matching instance assignments", () => {
    const cart = [
      testItem("hiv", { instance_id: "AVO-1-line-0" }),
      testItem("hiv", { instance_id: "AVO-1-line-1" }),
    ];
    const assignments: PersonAssignmentEntry[] = [
      entry("hiv", 0, { instance_id: "AVO-1-line-0" }),
      entry("hiv", 1, { instance_id: "AVO-1-line-1" }),
    ];
    expect(validateAssignments(cart, assignments)).toEqual({ ok: true });
  });

  it("multi-line quote: fails when one of two same-test_id rows is unassigned", () => {
    const cart = [
      testItem("hiv", { instance_id: "AVO-1-line-0" }),
      testItem("hiv", { instance_id: "AVO-1-line-1" }),
    ];
    const assignments: PersonAssignmentEntry[] = [
      entry("hiv", 0, { instance_id: "AVO-1-line-0" }),
    ];
    const result = validateAssignments(cart, assignments);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("missing_assignments");
    expect(result.missingInstanceIds).toEqual(["AVO-1-line-1"]);
  });
});
