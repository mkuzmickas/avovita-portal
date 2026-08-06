"use client";

import { useMemo } from "react";
import { X, Users, ArrowRight, ArrowLeft, Info, AlertCircle, Copy } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeDiscount } from "@/lib/checkout/discount";
import { useRepeatClient } from "@/components/account/RepeatClientContext";
import { DiscountBanner } from "./DiscountBanner";
import type { CatalogueCartItem } from "@/components/catalogue/types";

/**
 * One assignment per cart row. Keyed by `instance_id` so the same
 * test_id can appear more than once (one row per person). instance_id
 * falls back to `test_id` when the cart row didn't carry one
 * (catalogue add path); Step 2 generates `step2:${test_id}:${nonce}`
 * for any additional rows it clones to support multi-person assignment.
 */
export interface PersonAssignmentEntry {
  instance_id: string;
  test_id: string;
  test_name: string;
  lab_name: string;
  price_cad: number;
  /** 0-based person index */
  person_index: number;
}

/** Stable cart id for a test row. Mirrors cartItemId() in
 *  catalogue/types.ts so removeItem() takes the right key without
 *  importing the function. */
function cartIdForTest(instanceId: string): string {
  return `test:${instanceId}`;
}

/** A unique-enough instance_id for a Step-2-created clone. Includes
 *  test_id for debuggability and a random suffix so rapid-fire clicks
 *  can't collide. The cart-context dedup makes accidental dupes a no-op
 *  anyway, but this keeps localStorage clean. */
function newCloneInstanceId(testId: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `step2:${testId}:${rand}`;
}

interface Step2AssignTestsProps {
  cart: CatalogueCartItem[];
  personCount: number;
  /** Persisted assignments from CheckoutClient state. */
  assignments: PersonAssignmentEntry[];
  /** Accepts both a value and a functional updater so handlers that
   *  also mutate the cart can avoid stale-closure races on rapid
   *  clicks. CheckoutClient passes React's setAssignments directly. */
  onAssignmentsChange: (
    next:
      | PersonAssignmentEntry[]
      | ((prev: PersonAssignmentEntry[]) => PersonAssignmentEntry[]),
  ) => void;
  /** Cart mutation hooks from CartContext. Step 2 clones cart rows
   *  on-demand when a customer assigns the same test to a second
   *  person, and removes them when they uncheck. */
  addCartItem: (item: CatalogueCartItem) => void;
  removeCartItem: (cartItemId: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

function personLabel(index: number): string {
  return index === 0 ? "Person 1 (You)" : `Person ${index + 1}`;
}

export function Step2AssignTests({
  cart,
  personCount,
  assignments,
  onAssignmentsChange,
  addCartItem,
  removeCartItem,
  onBack,
  onContinue,
}: Step2AssignTestsProps) {
  const peopleIndices = useMemo(
    () => Array.from({ length: personCount }, (_, i) => i),
    [personCount],
  );

  // Group cart rows by test_id so the customer sees one card per
  // unique test with checkboxes for each person. Two cart rows for the
  // same test (e.g. Vitamin D for John AND Jane) collapse into a
  // single card; the per-person checkboxes derive from `assignments`.
  type TestGroup = {
    test_id: string;
    test_name: string;
    lab_name: string;
    price_cad: number;
    /** Sample cart row used as a template when cloning. */
    template: CatalogueCartItem;
  };
  const testGroups = useMemo<TestGroup[]>(() => {
    const map = new Map<string, TestGroup>();
    for (const item of cart) {
      if (item.line_type !== "test") continue;
      if (map.has(item.test_id)) continue;
      map.set(item.test_id, {
        test_id: item.test_id,
        test_name: item.test_name,
        lab_name: item.lab_name,
        price_cad: item.price_cad,
        template: item,
      });
    }
    return [...map.values()];
  }, [cart]);

  // For each (test_id, person_index) pair, the assignment (if any) that
  // covers it. Used to render the checkbox state and to find the row
  // to remove when the customer unchecks.
  type AssignmentLookup = Map<string, PersonAssignmentEntry>;
  const assignmentByTestPerson = useMemo<AssignmentLookup>(() => {
    const map = new Map<string, PersonAssignmentEntry>();
    for (const a of assignments) {
      map.set(`${a.test_id}:${a.person_index}`, a);
    }
    return map;
  }, [assignments]);

  // Bucket assignments by person for the right-column summary.
  const assignmentsByPerson = useMemo(() => {
    const map = new Map<number, PersonAssignmentEntry[]>();
    for (const idx of peopleIndices) map.set(idx, []);
    for (const a of assignments) {
      const list = map.get(a.person_index);
      if (list) list.push(a);
    }
    return map;
  }, [assignments, peopleIndices]);

  // Continue rules:
  //   - every test in the cart has at least one person checked (no
  //     orphan rows — a test with zero people doesn't make sense)
  //   - every person has at least one test assigned to them
  const peopleWithoutTests = peopleIndices.filter(
    (idx) => (assignmentsByPerson.get(idx)?.length ?? 0) === 0,
  );
  const testsWithoutAnyone = testGroups.filter(
    (g) => !peopleIndices.some((idx) => assignmentByTestPerson.has(`${g.test_id}:${idx}`)),
  );
  const canContinue =
    testsWithoutAnyone.length === 0 && peopleWithoutTests.length === 0;

  // Cart subtotal — same value used by the order summary sidebar so the
  // step body and sidebar always agree.
  const cartSubtotal = cart.reduce(
    (s, c) => s + c.price_cad * c.quantity,
    0,
  );
  // Discount preview based on cart line count so it reflects the true
  // billable lines (a Vitamin D for two people counts as two lines).
  // Repeat-client gated — guests + first-timers see full subtotal.
  const repeatClient = useRepeatClient();
  const discount = computeDiscount(cart.length, repeatClient.eligible);
  const cartAfterDiscount = cartSubtotal - discount.total;

  /**
   * Toggle a (test_id, person_index) pair. The cart row count for a
   * test always equals the number of checked people on that test —
   * checking adds a row + assignment, unchecking removes both. Uses
   * functional updates so rapid clicks across different tests can't
   * stomp each other.
   */
  const togglePersonForTest = (
    group: TestGroup,
    personIndex: number,
  ) => {
    const key = `${group.test_id}:${personIndex}`;
    const existing = assignmentByTestPerson.get(key);

    if (existing) {
      // UNCHECK — drop the cart row first, then the assignment. Order
      // doesn't matter for correctness; React batches both setStates
      // into one render.
      removeCartItem(cartIdForTest(existing.instance_id));
      onAssignmentsChange((prev) =>
        prev.filter((a) => a.instance_id !== existing.instance_id),
      );
      return;
    }

    // CHECK — clone a new cart row and create the assignment.
    const newInstanceId = newCloneInstanceId(group.test_id);
    addCartItem({
      ...group.template,
      instance_id: newInstanceId,
    });
    onAssignmentsChange((prev) => [
      ...prev,
      {
        instance_id: newInstanceId,
        test_id: group.test_id,
        test_name: group.test_name,
        lab_name: group.lab_name,
        price_cad: group.price_cad,
        person_index: personIndex,
      },
    ]);
  };

  /** Right-column X — same effect as unchecking that person's box on
   *  the left card for this assignment. */
  const handleUnassign = (entry: PersonAssignmentEntry) => {
    removeCartItem(cartIdForTest(entry.instance_id));
    onAssignmentsChange((prev) =>
      prev.filter((a) => a.instance_id !== entry.instance_id),
    );
  };

  // ─── "Same tests as me" ───────────────────────────────────────────
  // The dominant real pattern for a 2-person booking is a couple
  // ordering identical panels. Copying person 1's assignment set onto
  // person 2 in one click removes ~N checkbox clicks (N = number of
  // tests) at what's otherwise the most repetitive part of checkout —
  // then only name / DOB / sex / consent remain on Step 3.
  //
  // Only surfaces when personCount === 2 AND person 2 is missing at
  // least one test that person 1 has (i.e. there's actually work to
  // mirror). Nothing happens if everything already matches.
  const person1TestIds = useMemo(
    () =>
      new Set(
        assignments.filter((a) => a.person_index === 0).map((a) => a.test_id),
      ),
    [assignments],
  );
  const person2TestIds = useMemo(
    () =>
      new Set(
        assignments.filter((a) => a.person_index === 1).map((a) => a.test_id),
      ),
    [assignments],
  );
  const testsToMirror = useMemo(() => {
    if (personCount !== 2) return [];
    return testGroups.filter(
      (g) => person1TestIds.has(g.test_id) && !person2TestIds.has(g.test_id),
    );
  }, [testGroups, personCount, person1TestIds, person2TestIds]);

  const handleMirrorToPerson2 = () => {
    if (testsToMirror.length === 0) return;
    // Batch cart clones and assignment additions so a mirror of N
    // tests fires one React commit each way. Each togglePersonForTest
    // uses functional setState so consecutive calls compose cleanly.
    for (const g of testsToMirror) togglePersonForTest(g, 1);
  };

  return (
    <div
      className="rounded-2xl border p-5 sm:p-7"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5" style={{ color: "#c4973a" }} />
        <p
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: "#c4973a" }}
        >
          Step 2 of 4
        </p>
      </div>

      <h1
        className="font-heading text-2xl sm:text-3xl font-semibold mb-2"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Assign tests <span style={{ color: "#c4973a" }}>to people</span>
      </h1>

      <div
        className="flex items-start gap-2 rounded-lg border px-4 py-3 mb-4"
        style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
      >
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#c4973a" }} />
        <p className="text-xs leading-relaxed" style={{ color: "#e8d5a3" }}>
          Check the box for each person who should get this test. You can
          assign the same test to more than one person — each person on
          the checkbox row will be billed and resulted separately.
        </p>
      </div>

      {/* "Same tests as me" — one click mirrors person 1's tests onto
          person 2. Only when there's actually work to do (person 2
          missing at least one test person 1 has). Dominant real pattern
          for 2-person bookings is a couple ordering identical panels. */}
      {personCount === 2 && testsToMirror.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-lg border px-4 py-3 mb-4"
          style={{
            backgroundColor: "rgba(196, 151, 58, 0.08)",
            borderColor: "#c4973a",
          }}
        >
          <Copy className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#c4973a" }} />
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs leading-relaxed" style={{ color: "#e8d5a3" }}>
              Ordering the same tests for both people? One click assigns
              your selection to person 2.
            </p>
            <button
              type="button"
              onClick={handleMirrorToPerson2}
              className="mf-btn-secondary px-3 py-1.5 text-xs whitespace-nowrap shrink-0"
            >
              Same tests as me
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Multi-test discount banner */}
      {discount.applies && (
        <div className="mb-5">
          <DiscountBanner lineCount={cart.length} />
        </div>
      )}

      {/* Two columns desktop, stacked mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT — tests in cart with per-person checkboxes */}
        <div>
          <h3
            className="font-heading text-lg font-semibold mb-3 flex items-center gap-2"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Tests in cart
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#2d6b35",
                color: "#e8d5a3",
                fontFamily: '"DM Sans", sans-serif',
              }}
            >
              {testGroups.length} test{testGroups.length === 1 ? "" : "s"}
            </span>
          </h3>

          {testGroups.length === 0 ? (
            <div
              className="rounded-lg border px-4 py-6 text-center"
              style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
            >
              <p className="text-xs" style={{ color: "#c4973a" }}>
                No tests in your cart yet.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {testGroups.map((group) => {
                const assignedPeople = peopleIndices.filter((idx) =>
                  assignmentByTestPerson.has(`${group.test_id}:${idx}`),
                );
                const orphan = assignedPeople.length === 0;
                return (
                  <li
                    key={group.test_id}
                    className="rounded-lg border p-3"
                    style={{
                      backgroundColor: "#0f2614",
                      borderColor: orphan ? "#c4973a" : "#2d6b35",
                    }}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium leading-snug"
                          style={{ color: "#ffffff" }}
                        >
                          {group.test_name}
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "#6ab04c" }}
                        >
                          {group.lab_name} ·{" "}
                          <span style={{ color: "#c4973a", fontWeight: 600 }}>
                            {formatCurrency(group.price_cad)} per person
                          </span>
                        </p>
                      </div>
                    </div>

                    <div>
                      <p
                        className="text-[11px] uppercase tracking-wider font-semibold mb-2"
                        style={{ color: "#c4973a" }}
                      >
                        Assign to:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {peopleIndices.map((idx) => {
                          const checked = assignmentByTestPerson.has(
                            `${group.test_id}:${idx}`,
                          );
                          return (
                            <label
                              key={idx}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors"
                              style={{
                                backgroundColor: checked
                                  ? "#1f4a28"
                                  : "transparent",
                                borderColor: checked ? "#c4973a" : "#2d6b35",
                                color: checked ? "#ffffff" : "#e8d5a3",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  togglePersonForTest(group, idx)
                                }
                                className="sr-only"
                              />
                              <span
                                aria-hidden="true"
                                className="inline-block w-3.5 h-3.5 rounded-sm border flex items-center justify-center"
                                style={{
                                  backgroundColor: checked
                                    ? "#c4973a"
                                    : "transparent",
                                  borderColor: checked ? "#c4973a" : "#6ab04c",
                                }}
                              >
                                {checked && (
                                  <svg
                                    width="9"
                                    height="9"
                                    viewBox="0 0 12 12"
                                    fill="none"
                                  >
                                    <path
                                      d="M2 6.5L5 9.5L10 3.5"
                                      stroke="#0a1a0d"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              {personLabel(idx)}
                            </label>
                          );
                        })}
                      </div>
                      {orphan && (
                        <p
                          className="text-[11px] mt-2"
                          style={{ color: "#c4973a" }}
                        >
                          Pick at least one person, or remove this test from
                          your cart.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* RIGHT — person columns */}
        <div className="space-y-4">
          {peopleIndices.map((idx) => {
            const items = assignmentsByPerson.get(idx) ?? [];
            const subtotal = items.reduce((s, a) => s + a.price_cad, 0);
            return (
              <div
                key={idx}
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: items.length === 0 ? "#c4973a" : "#2d6b35",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4
                    className="font-heading font-semibold"
                    style={{
                      color: "#ffffff",
                      fontFamily: '"Cormorant Garamond", Georgia, serif',
                    }}
                  >
                    {personLabel(idx)}
                  </h4>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "#c4973a" }}
                  >
                    {formatCurrency(subtotal)}
                  </span>
                </div>

                {items.length === 0 ? (
                  <p className="text-xs italic" style={{ color: "#c4973a" }}>
                    No tests assigned yet — check this person on one of the
                    test cards to add a copy.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((entry) => (
                      <li
                        key={entry.instance_id}
                        className="flex items-center gap-2 px-3 py-2 rounded-md border"
                        style={{
                          backgroundColor: "#1a3d22",
                          borderColor: "#2d6b35",
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs font-medium truncate"
                            style={{ color: "#ffffff" }}
                          >
                            {entry.test_name}
                          </p>
                          <p
                            className="text-[10px]"
                            style={{ color: "#6ab04c" }}
                          >
                            {formatCurrency(entry.price_cad)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUnassign(entry)}
                          className="p-1 rounded-md transition-colors"
                          style={{ color: "#6ab04c" }}
                          aria-label={`Remove ${entry.test_name} from ${personLabel(idx)}`}
                          title="Remove this test from this person"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tests subtotal + nav */}
      <div
        className="mt-6 pt-5 border-t space-y-1"
        style={{ borderColor: "#2d6b35" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: "#e8d5a3" }}>
            Tests subtotal ({cart.length}{" "}
            {cart.length === 1 ? "line" : "lines"})
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "#e8d5a3" }}
          >
            {formatCurrency(cartSubtotal)}
          </span>
        </div>
        {discount.applies && (
          <>
            <div
              className="flex items-center justify-between text-sm font-medium"
              style={{ color: "#8dc63f" }}
            >
              <span>
                Repeat-client discount ({discount.line_count} × $
                {discount.per_line.toFixed(2)})
              </span>
              <span>−{formatCurrency(discount.total)}</span>
            </div>
            <div
              className="flex items-center justify-between pt-2 mt-1 border-t"
              style={{ borderColor: "#2d6b35" }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: "#ffffff" }}
              >
                After discount
              </span>
              <span
                className="text-lg font-semibold"
                style={{ color: "#c4973a" }}
              >
                {formatCurrency(cartAfterDiscount)}
              </span>
            </div>
          </>
        )}
        <div className="h-3" />

        {!canContinue && (
          <div
            className="flex items-start gap-2 rounded-lg border px-4 py-3 mb-4 text-sm"
            style={{
              backgroundColor: "rgba(196, 151, 58, 0.1)",
              borderColor: "#c4973a",
              color: "#c4973a",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {testsWithoutAnyone.length > 0 && (
                <>
                  {testsWithoutAnyone.length}{" "}
                  {testsWithoutAnyone.length === 1 ? "test has" : "tests have"}{" "}
                  no one checked.{" "}
                </>
              )}
              {peopleWithoutTests.length > 0 && (
                <>
                  Each person needs at least one test —{" "}
                  {peopleWithoutTests.map((i) => personLabel(i)).join(", ")}{" "}
                  {peopleWithoutTests.length === 1 ? "is" : "are"} still empty.
                </>
              )}
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mf-btn-secondary px-5 py-2.5 sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="mf-btn-primary px-5 py-2.5 sm:flex-1 sm:max-w-xs"
          >
            Continue to Collection Details
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
