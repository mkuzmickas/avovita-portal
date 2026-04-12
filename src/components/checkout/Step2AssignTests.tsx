"use client";

import { useState, useMemo } from "react";
import {
  X,
  Users,
  ArrowRight,
  ArrowLeft,
  Info,
  AlertCircle,
  UserPlus,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeDiscount } from "@/lib/checkout/discount";
import { DiscountBanner } from "./DiscountBanner";
import type { CatalogueCartItem } from "@/components/catalogue/types";

/**
 * One assignment per cart item. The same test_id can never appear twice
 * in the assignments array — assigning a test "moves" it to its new
 * person, replacing any previous mapping. To order the same test for
 * multiple people the customer must add it to the cart that many times
 * before reaching checkout.
 */
export interface PersonAssignmentEntry {
  test_id: string;
  test_name: string;
  lab_name: string;
  price_cad: number;
  /** 0-based person index */
  person_index: number;
}

interface Step2AssignTestsProps {
  cart: CatalogueCartItem[];
  personCount: number;
  /** Persisted assignments from CheckoutClient state. */
  assignments: PersonAssignmentEntry[];
  onAssignmentsChange: (next: PersonAssignmentEntry[]) => void;
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
  onBack,
  onContinue,
}: Step2AssignTestsProps) {
  const [openMenuTestId, setOpenMenuTestId] = useState<string | null>(null);

  const peopleIndices = useMemo(
    () => Array.from({ length: personCount }, (_, i) => i),
    [personCount]
  );

  // Bucket assignments by person for the right column display
  const assignmentsByPerson = useMemo(() => {
    const map = new Map<number, PersonAssignmentEntry[]>();
    for (const idx of peopleIndices) map.set(idx, []);
    for (const a of assignments) {
      const list = map.get(a.person_index);
      if (list) list.push(a);
    }
    return map;
  }, [assignments, peopleIndices]);

  // Cart items still waiting to be assigned (left column)
  const unassignedCartItems = useMemo(
    () =>
      cart.filter(
        (item) => !assignments.some((a) => a.test_id === item.test_id)
      ),
    [cart, assignments]
  );

  // Continue rules:
  //   - every cart item must be assigned
  //   - every person must have at least one test assigned to them
  const peopleWithoutTests = peopleIndices.filter(
    (idx) => (assignmentsByPerson.get(idx)?.length ?? 0) === 0
  );
  const allCartAssigned = unassignedCartItems.length === 0;
  const canContinue = allCartAssigned && peopleWithoutTests.length === 0;

  // Cart subtotal — same value used by the order summary sidebar so the
  // step body and sidebar always agree, regardless of how many cart items
  // have been assigned so far.
  const cartSubtotal = cart.reduce(
    (s, c) => s + c.price_cad * c.quantity,
    0
  );

  // Discount preview is based on cart line count, not on partial
  // assignment progress, so the banner appears as soon as ≥ 2 cart items
  // are present.
  const discount = computeDiscount(cart.length);
  const cartAfterDiscount = cartSubtotal - discount.total;

  /**
   * Move a test to a person. Replaces any prior assignment for that
   * test_id — the same test can only belong to one person at a time.
   */
  const handleAssign = (item: CatalogueCartItem, personIndex: number) => {
    const next = assignments.filter((a) => a.test_id !== item.test_id);
    next.push({
      test_id: item.test_id,
      test_name: item.test_name,
      lab_name: item.lab_name,
      price_cad: item.price_cad,
      person_index: personIndex,
    });
    onAssignmentsChange(next);
    setOpenMenuTestId(null);
  };

  /** Send a test back to the unassigned column. */
  const handleUnassign = (testId: string) => {
    onAssignmentsChange(assignments.filter((a) => a.test_id !== testId));
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
        style={{
          backgroundColor: "#0f2614",
          borderColor: "#2d6b35",
        }}
      >
        <Info
          className="w-4 h-4 shrink-0 mt-0.5"
          style={{ color: "#c4973a" }}
        />
        <p className="text-xs leading-relaxed" style={{ color: "#e8d5a3" }}>
          Each test can only be assigned to one person. To order the same
          test for multiple people, add it to your cart multiple times.
        </p>
      </div>

      {/* Multi-test discount banner */}
      {discount.applies && (
        <div className="mb-5">
          <DiscountBanner lineCount={cart.length} />
        </div>
      )}

      {/* Two columns desktop, stacked mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT — unassigned tests from cart */}
        <div>
          <h3
            className="font-heading text-lg font-semibold mb-3 flex items-center gap-2"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Unassigned Tests
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#2d6b35",
                color: "#e8d5a3",
                fontFamily: '"DM Sans", sans-serif',
              }}
            >
              {unassignedCartItems.length} of {cart.length}
            </span>
          </h3>

          {unassignedCartItems.length === 0 ? (
            <div
              className="rounded-lg border px-4 py-6 text-center"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#2d6b35",
              }}
            >
              <p className="text-xs" style={{ color: "#8dc63f" }}>
                All tests assigned ✓
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {unassignedCartItems.map((item) => {
                const menuOpen = openMenuTestId === item.test_id;

                return (
                  <li
                    key={item.test_id}
                    className="rounded-lg border p-3 relative"
                    style={{
                      backgroundColor: "#0f2614",
                      borderColor: "#2d6b35",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium leading-snug"
                          style={{ color: "#ffffff" }}
                        >
                          {item.test_name}
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "#6ab04c" }}
                        >
                          {item.lab_name} ·{" "}
                          <span style={{ color: "#c4973a", fontWeight: 600 }}>
                            {formatCurrency(item.price_cad)}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenuTestId((prev) =>
                            prev === item.test_id ? null : item.test_id
                          )
                        }
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0"
                        style={{
                          backgroundColor: "#c4973a",
                          color: "#0a1a0d",
                        }}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Assign
                      </button>
                    </div>

                    {/* Person picker menu */}
                    {menuOpen && (
                      <div
                        className="absolute right-3 top-12 z-20 rounded-lg border shadow-xl py-1 min-w-[200px]"
                        style={{
                          backgroundColor: "#0a1a0d",
                          borderColor: "#c4973a",
                        }}
                      >
                        {peopleIndices.map((idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleAssign(item, idx)}
                            className="w-full text-left px-4 py-2 text-sm transition-colors hover:bg-[#1f4a28]"
                            style={{ color: "#e8d5a3" }}
                          >
                            {personLabel(idx)}
                          </button>
                        ))}
                      </div>
                    )}
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
                  <p
                    className="text-xs italic"
                    style={{ color: "#c4973a" }}
                  >
                    No tests assigned yet — click Assign on a test to add it
                    here.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((entry) => (
                      <li
                        key={entry.test_id}
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
                          onClick={() => handleUnassign(entry.test_id)}
                          className="p-1 rounded-md transition-colors"
                          style={{ color: "#6ab04c" }}
                          aria-label="Unassign"
                          title="Move back to unassigned"
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
          <span
            className="text-sm font-medium"
            style={{ color: "#e8d5a3" }}
          >
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
                Multi-test discount ({discount.line_count} × $
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
              {!allCartAssigned && (
                <>
                  {unassignedCartItems.length}{" "}
                  {unassignedCartItems.length === 1 ? "test is" : "tests are"}{" "}
                  still unassigned.{" "}
                </>
              )}
              {peopleWithoutTests.length > 0 && (
                <>
                  Each person needs at least one test —{" "}
                  {peopleWithoutTests
                    .map((i) => personLabel(i))
                    .join(", ")}{" "}
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
