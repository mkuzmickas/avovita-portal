"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  X,
  Users,
  ArrowRight,
  ArrowLeft,
  Info,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CatalogueCartItem } from "@/components/catalogue/types";

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

  const assignmentsByPerson = useMemo(() => {
    const map = new Map<number, PersonAssignmentEntry[]>();
    for (const idx of peopleIndices) map.set(idx, []);
    for (const a of assignments) {
      const list = map.get(a.person_index);
      if (list) list.push(a);
    }
    return map;
  }, [assignments, peopleIndices]);

  // Block continuing until every person has at least one test
  const peopleWithoutTests = peopleIndices.filter(
    (idx) => (assignmentsByPerson.get(idx)?.length ?? 0) === 0
  );
  const canContinue = peopleWithoutTests.length === 0;

  // Compute running total: each assignment counts as one billed line
  const runningTotal = assignments.reduce((s, a) => s + a.price_cad, 0);

  const handleAssign = (item: CatalogueCartItem, personIndex: number) => {
    // Don't allow duplicate (same test, same person)
    const exists = assignments.some(
      (a) => a.test_id === item.test_id && a.person_index === personIndex
    );
    if (exists) {
      setOpenMenuTestId(null);
      return;
    }
    onAssignmentsChange([
      ...assignments,
      {
        test_id: item.test_id,
        test_name: item.test_name,
        lab_name: item.lab_name,
        price_cad: item.price_cad,
        person_index: personIndex,
      },
    ]);
    setOpenMenuTestId(null);
  };

  const handleRemove = (entry: PersonAssignmentEntry) => {
    onAssignmentsChange(
      assignments.filter(
        (a) =>
          !(
            a.test_id === entry.test_id &&
            a.person_index === entry.person_index
          )
      )
    );
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
        className="flex items-start gap-2 rounded-lg border px-4 py-3 mb-5"
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
          The same test can be assigned to multiple people. Each assignment
          creates a separate order line.
        </p>
      </div>

      {/* Two columns desktop, stacked mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT — available tests from cart */}
        <div>
          <h3
            className="font-heading text-lg font-semibold mb-3"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Available Tests
          </h3>
          <ul className="space-y-2">
            {cart.map((item) => {
              const assignedPersons = assignments
                .filter((a) => a.test_id === item.test_id)
                .map((a) => a.person_index);
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
                      {assignedPersons.length > 0 && (
                        <p
                          className="text-[11px] mt-1"
                          style={{ color: "#8dc63f" }}
                        >
                          Assigned to:{" "}
                          {assignedPersons
                            .sort()
                            .map((i) => (i === 0 ? "You" : `Person ${i + 1}`))
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuTestId((prev) =>
                          prev === item.test_id ? null : item.test_id
                        )
                      }
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0"
                      style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Assign
                    </button>
                  </div>

                  {/* Assign menu */}
                  {menuOpen && (
                    <div
                      className="absolute right-3 top-12 z-20 rounded-lg border shadow-xl py-1 min-w-[200px]"
                      style={{
                        backgroundColor: "#0a1a0d",
                        borderColor: "#c4973a",
                      }}
                    >
                      {peopleIndices.map((idx) => {
                        const already = assignedPersons.includes(idx);
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={already}
                            onClick={() => handleAssign(item, idx)}
                            className="w-full text-left px-4 py-2 text-sm transition-colors"
                            style={{
                              color: already ? "#6ab04c" : "#e8d5a3",
                              cursor: already ? "default" : "pointer",
                            }}
                          >
                            {personLabel(idx)}
                            {already && " ✓"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
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
                  borderColor:
                    items.length === 0 ? "#c4973a" : "#2d6b35",
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
                        key={`${entry.test_id}-${entry.person_index}`}
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
                          onClick={() => handleRemove(entry)}
                          className="p-1 rounded-md transition-colors"
                          style={{ color: "#6ab04c" }}
                          aria-label="Remove"
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

      {/* Running total + nav */}
      <div
        className="mt-6 pt-5 border-t"
        style={{ borderColor: "#2d6b35" }}
      >
        <div className="flex items-center justify-between mb-4">
          <span
            className="text-sm font-medium"
            style={{ color: "#e8d5a3" }}
          >
            Running tests total ({assignments.length}{" "}
            {assignments.length === 1 ? "assignment" : "assignments"})
          </span>
          <span
            className="text-lg font-semibold"
            style={{ color: "#c4973a" }}
          >
            {formatCurrency(runningTotal)}
          </span>
        </div>

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
              Each person needs at least one test assigned to them.{" "}
              {peopleWithoutTests
                .map((i) => personLabel(i))
                .join(", ")}{" "}
              {peopleWithoutTests.length === 1 ? "is" : "are"} still empty.
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
