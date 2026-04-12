"use client";

import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  MapPin,
  Lock,
  AlertCircle,
  ChevronDown,
  Tag,
  CheckCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type {
  CheckoutPerson,
  CollectionAddress,
  CheckoutPayload,
  TestAssignment,
} from "@/lib/checkout/types";
import { computeVisitFees } from "@/lib/checkout/visit-fees";
import { computeDiscount } from "@/lib/checkout/discount";
import { DiscountBanner } from "./DiscountBanner";
import type { PersonAssignmentEntry } from "./Step2AssignTests";

interface Step4Props {
  persons: CheckoutPerson[];
  collectionAddress: CollectionAddress;
  assignments: PersonAssignmentEntry[];
  accountUserId: string | null;
  onBack: () => void;
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  spouse_partner: "Spouse / Partner",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  friend: "Friend",
  colleague: "Colleague",
  other: "Other",
};

export function Step4Review({
  persons,
  collectionAddress,
  assignments,
  accountUserId,
  onBack,
}: Step4Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const testModeEnabled =
    process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === "true";

  const visitFees = useMemo(
    () => computeVisitFees(persons.length),
    [persons.length]
  );

  const subtotal = assignments.reduce((s, a) => s + a.price_cad, 0);
  const discount = useMemo(
    () => computeDiscount(assignments.length),
    [assignments.length]
  );
  const subtotalAfterDiscount = subtotal - discount.total;
  const total = subtotalAfterDiscount + visitFees.total;

  const assignmentsByPerson = useMemo(() => {
    const m = new Map<number, PersonAssignmentEntry[]>();
    for (const p of persons) m.set(p.index, []);
    for (const a of assignments) m.get(a.person_index)?.push(a);
    return m;
  }, [assignments, persons]);

  const handleApplyPromo = () => {
    setPromoError(null);
    if (!testModeEnabled) {
      setPromoError("Promo codes are not currently available.");
      return;
    }
    if (promoInput.trim().toUpperCase() === "AVOVITA-TEST") {
      setPromoApplied(true);
      setPromoError(null);
    } else {
      setPromoError("Invalid promo code.");
      setPromoApplied(false);
    }
  };

  const handlePay = async () => {
    setSubmitting(true);
    setError(null);

    const payload: CheckoutPayload = {
      persons,
      collection_address: collectionAddress,
      assignments: assignments.map<TestAssignment>((a) => ({
        test_id: a.test_id,
        test_name: a.test_name,
        lab_name: a.lab_name,
        price_cad: a.price_cad,
        assigned_to_person: a.person_index,
      })),
      visit_fees: visitFees,
      subtotal,
      discount_cad: discount.total,
      total,
      account_user_id: accountUserId,
      promo_code: promoApplied ? "AVOVITA-TEST" : undefined,
    };

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Checkout failed");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rounded-2xl border p-5 sm:p-7"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Lock className="w-5 h-5" style={{ color: "#c4973a" }} />
        <p
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: "#c4973a" }}
        >
          Step 4 of 4
        </p>
      </div>

      <h1
        className="font-heading text-2xl sm:text-3xl font-semibold mb-4"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Review & <span style={{ color: "#c4973a" }}>Pay</span>
      </h1>

      {/* Multi-test discount banner */}
      {discount.applies && (
        <div className="mb-6">
          <DiscountBanner lineCount={assignments.length} />
        </div>
      )}

      {/* Collection address */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4" style={{ color: "#c4973a" }} />
          <h3
            className="font-heading text-lg font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Collection Address
          </h3>
        </div>
        <div
          className="rounded-lg border px-4 py-3"
          style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
        >
          <p className="text-sm" style={{ color: "#ffffff" }}>
            {collectionAddress.address_line1}
          </p>
          {collectionAddress.address_line2 && (
            <p className="text-sm" style={{ color: "#ffffff" }}>
              {collectionAddress.address_line2}
            </p>
          )}
          <p className="text-sm" style={{ color: "#e8d5a3" }}>
            {collectionAddress.city}, {collectionAddress.province}{" "}
            {collectionAddress.postal_code}
          </p>
        </div>
      </section>

      {/* People + their tests */}
      <section className="mb-6">
        <h3
          className="font-heading text-lg font-semibold mb-3"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          People & Tests
        </h3>
        <div className="space-y-3">
          {persons.map((person) => {
            const personItems = assignmentsByPerson.get(person.index) ?? [];
            const personSubtotal = personItems.reduce(
              (s, a) => s + a.price_cad,
              0
            );
            return (
              <div
                key={person.index}
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: "#2d6b35",
                }}
              >
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "#ffffff" }}
                    >
                      {person.first_name} {person.last_name}
                      {!person.is_account_holder && person.relationship && (
                        <span
                          className="text-xs font-normal ml-2"
                          style={{ color: "#6ab04c" }}
                        >
                          · {RELATIONSHIP_LABEL[person.relationship]}
                        </span>
                      )}
                      {person.is_account_holder && (
                        <span
                          className="text-xs font-normal ml-2"
                          style={{ color: "#6ab04c" }}
                        >
                          · Account holder (you)
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "#c4973a" }}
                  >
                    {formatCurrency(personSubtotal)}
                  </span>
                </div>
                <ul
                  className="space-y-1.5 pl-3 border-l-2"
                  style={{ borderColor: "#2d6b35" }}
                >
                  {personItems.map((a) => (
                    <li
                      key={`${a.test_id}-${a.person_index}`}
                      className="flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span style={{ color: "#e8d5a3" }}>
                          {a.test_name}{" "}
                          <span style={{ color: "#6ab04c" }}>
                            · {a.lab_name}
                          </span>
                        </span>
                        <span style={{ color: "#c4973a" }}>
                          {formatCurrency(a.price_cad)}
                        </span>
                      </div>
                      {discount.applies && (
                        <div
                          className="flex items-center justify-end gap-3 text-[10px] font-medium"
                          style={{ color: "#8dc63f" }}
                        >
                          −{formatCurrency(discount.per_line)} multi-test
                          discount
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Totals */}
      <section
        className="rounded-lg border p-5 mb-6"
        style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
      >
        <div className="space-y-2 text-sm">
          <div
            className="flex justify-between"
            style={{ color: "#e8d5a3" }}
          >
            <span>Tests subtotal ({assignments.length} lines)</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discount.applies && (
            <>
              <div
                className="flex justify-between font-medium"
                style={{ color: "#8dc63f" }}
              >
                <span>Multi-test discount ($20 off per test)</span>
                <span>−{formatCurrency(discount.total)}</span>
              </div>
              <div
                className="flex justify-between"
                style={{ color: "#e8d5a3" }}
              >
                <span>Subtotal after discount</span>
                <span>{formatCurrency(subtotalAfterDiscount)}</span>
              </div>
            </>
          )}
          <div
            className="flex justify-between pt-2 mt-1 border-t"
            style={{ color: "#e8d5a3", borderColor: "#2d6b35" }}
          >
            <span>Visit fee base</span>
            <span>{formatCurrency(visitFees.base_fee)}</span>
          </div>
          {visitFees.additional_person_count > 0 && (
            <div
              className="flex justify-between"
              style={{ color: "#e8d5a3" }}
            >
              <span>
                Additional people ({visitFees.additional_person_count})
              </span>
              <span>
                {formatCurrency(
                  visitFees.additional_fee_per_person *
                    visitFees.additional_person_count
                )}
              </span>
            </div>
          )}
          <div
            className="flex justify-between text-xl font-semibold pt-3 border-t mt-2"
            style={{ borderColor: "#2d6b35" }}
          >
            <span style={{ color: "#ffffff" }}>Grand Total</span>
            <span style={{ color: "#c4973a" }}>
              {formatCurrency(total)} CAD
            </span>
          </div>
        </div>
      </section>

      {/* Promo code section — only shown when test mode is enabled */}
      {testModeEnabled && (
        <section className="mb-5">
          <button
            type="button"
            onClick={() => setPromoOpen((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium mb-2 cursor-pointer"
            style={{ color: "#e8d5a3" }}
          >
            <Tag className="w-4 h-4" style={{ color: "#6ab04c" }} />
            Have a promo code?
            <ChevronDown
              className="w-3.5 h-3.5 transition-transform"
              style={{
                color: "#6ab04c",
                transform: promoOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
          {promoOpen && (
            <div
              className="rounded-lg border p-4"
              style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
            >
              {promoApplied ? (
                <div
                  className="flex items-center gap-2 p-3 rounded-lg border"
                  style={{
                    backgroundColor: "rgba(141, 198, 63, 0.12)",
                    borderColor: "#8dc63f",
                  }}
                >
                  <CheckCircle
                    className="w-5 h-5 shrink-0"
                    style={{ color: "#8dc63f" }}
                  />
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "#8dc63f" }}
                    >
                      Test code applied — 100% discount
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                      No payment will be charged. The order will process
                      normally.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => {
                      setPromoInput(e.target.value);
                      setPromoError(null);
                    }}
                    placeholder="Enter promo code"
                    className="mf-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    className="mf-btn-secondary px-4 py-2 shrink-0"
                  >
                    Apply
                  </button>
                </div>
              )}
              {promoError && (
                <p
                  className="text-xs mt-2"
                  style={{ color: "#e05252" }}
                >
                  {promoError}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <p className="text-xs mb-5" style={{ color: "#6ab04c" }}>
        {promoApplied
          ? "Test mode — $0.00 checkout. The order will be created with all notifications firing normally."
          : `Payment is processed securely by Stripe. ${
              accountUserId
                ? "Your order will be linked to your existing account."
                : "You will be prompted to create your AvoVita account after payment to access your results."
            }`}
      </p>

      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-sm border mb-4"
          style={{
            backgroundColor: "rgba(224, 82, 82, 0.12)",
            borderColor: "#e05252",
            color: "#e05252",
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="mf-btn-secondary px-5 py-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={handlePay}
          disabled={submitting}
          className="mf-btn-primary px-5 py-3 sm:flex-1 sm:max-w-xs text-base"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "Redirecting…" : "Proceed to Payment"}
          {!submitting && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
