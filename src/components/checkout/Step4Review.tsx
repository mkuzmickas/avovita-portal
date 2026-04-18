"use client";

import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  MapPin,
  Lock,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Tag,
  CheckCircle,
  CheckSquare,
  Square,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAnalytics } from "@/lib/analytics/useAnalytics";
import { useCart } from "@/components/cart/CartContext";
import type { CartItem } from "@/components/catalogue/types";
import type { PendingOrderPayload } from "@/lib/checkout/pending-order";
import type {
  SupplementFulfillment,
  SupplementShippingAddress,
} from "@/types/supplements";
import { SUPPLEMENT_SHIPPING_FEE_CAD } from "@/types/supplements";
import type {
  CheckoutPerson,
  CollectionAddress,
  CheckoutPayload,
  RepresentativeBlock,
  TestAssignment,
  AppliedPromo,
} from "@/lib/checkout/types";
import { computeVisitFees } from "@/lib/checkout/visit-fees";
import { computeDiscount } from "@/lib/checkout/discount";
import { calculateTotals } from "@/lib/checkout/totals";
import { DiscountBanner } from "./DiscountBanner";
import type { PersonAssignmentEntry } from "./Step2AssignTests";

interface Step4Props {
  persons: CheckoutPerson[];
  collectionAddress: CollectionAddress;
  assignments: PersonAssignmentEntry[];
  accountUserId: string | null;
  onBack: () => void;
  /** Promo state lifted to CheckoutClient so the Order Summary sidebar can react. */
  appliedPromo: AppliedPromo | null;
  onPromoChange: (next: AppliedPromo | null) => void;
  orderMode: "self" | "caregiver";
  representative: RepresentativeBlock;
  /** Supplement fulfillment state (from CheckoutClient step 3.5). */
  suppFulfillment?: SupplementFulfillment | null;
  suppShippingAddress?: SupplementShippingAddress | null;
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

// ─── Shipping risk test IDs ─────────────────────────────────────────

const SHIPPING_RISK_TEST_IDS = new Set([
  // Armin Labs
  "5c4c3e00-f5c8-4649-a602-4a33f79e8e8a",
  "8f87bbe5-c7bf-48e4-8ad8-a330747c634b",
  "722938cd-7851-4e03-b749-b4288eca1ebe",
  "ff187073-cff2-4219-bbaf-2473fc643cfa",
  "4a1925f7-0a82-4934-bbc6-f1a5e7b4bbb3",
  "7ffce401-88d8-4024-a07e-927c721c4d9f",
  // Dynacare
  "9cfa0cf1-b455-4c92-b32a-b7c2a0772dfd",
  "192cd6b8-f057-4132-82f4-77ad23ee8c06",
  "7df7be3c-e861-431c-b6b5-f504ddb56219",
  // FRAT - ReligenDx
  "7471d38d-d0c2-44b2-9e77-0cec3b575ddb",
  // EPISEEK - Precision Epigenomics
  "e034f672-92d6-477a-bd1f-f81d9d18662c",
  // CBC - Mayo Clinic (special: only when it's the sole Mayo test)
  "8e46bec5-526c-42be-909c-447235e9ecd0",
]);

const CBC_TEST_ID = "8e46bec5-526c-42be-909c-447235e9ecd0";
const MAYO_LAB_NAME = "Mayo Clinic Laboratories";

export function Step4Review({
  persons,
  collectionAddress,
  assignments,
  accountUserId,
  onBack,
  appliedPromo,
  onPromoChange,
  orderMode,
  representative,
  suppFulfillment = null,
  suppShippingAddress = null,
}: Step4Props) {
  const { trackEvent } = useAnalytics();
  const { cart } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSubmitting, setPromoSubmitting] = useState(false);
  const [shippingRiskAcknowledged, setShippingRiskAcknowledged] =
    useState(false);

  const visitFees = useMemo(
    () => computeVisitFees(persons.length, collectionAddress.postal_code),
    [persons.length, collectionAddress.postal_code]
  );

  // Single source of truth — same function powers the right-rail summary.
  // appliedPromo IS in the dep array so a fresh promo recomputes totals
  // on the very next render.
  // Supplement + resource subtotals — computed before calculateTotals
  // so the promo discount base includes all line types.
  const supplementSubtotal = cart
    .filter((i) => i.line_type === "supplement")
    .reduce((s, i) => s + i.price_cad * i.quantity, 0);
  const resourceSubtotal = cart
    .filter((i) => i.line_type === "resource")
    .reduce((s, i) => s + i.price_cad, 0);
  const suppShippingFee =
    suppFulfillment === "shipping" ? SUPPLEMENT_SHIPPING_FEE_CAD : 0;

  const totals = useMemo(
    () =>
      calculateTotals({
        testLinePrices: assignments.map((a) => a.price_cad),
        visitFee: visitFees.total,
        appliedPromo,
        supplementSubtotal,
        resourceSubtotal,
        supplementShippingFee: suppShippingFee,
      }),
    [assignments, visitFees.total, appliedPromo, supplementSubtotal, resourceSubtotal, suppShippingFee]
  );
  const subtotal = totals.testsSubtotal;
  const discount = useMemo(
    () => computeDiscount(assignments.length),
    [assignments.length]
  );
  const subtotalAfterDiscount = totals.subtotalAfterDiscount;
  const promoDiscount = totals.promoDiscount;
  const grossTotal =
    subtotalAfterDiscount +
    visitFees.total +
    supplementSubtotal +
    resourceSubtotal +
    suppShippingFee;
  const total = totals.grandTotal;

  const assignmentsByPerson = useMemo(() => {
    const m = new Map<number, PersonAssignmentEntry[]>();
    for (const p of persons) m.set(p.index, []);
    for (const a of assignments) m.get(a.person_index)?.push(a);
    return m;
  }, [assignments, persons]);

  // ─── Shipping risk logic ──────────────────────────────────────────
  const showShippingRisk = useMemo(() => {
    const testIds = assignments.map((a) => a.test_id);

    // Non-CBC risk tests — always trigger if present
    const hasNonCbcRiskTest = testIds.some(
      (id) => SHIPPING_RISK_TEST_IDS.has(id) && id !== CBC_TEST_ID
    );
    if (hasNonCbcRiskTest) return true;

    // CBC special logic: only triggers when CBC is the ONLY Mayo test
    const hasCbc = testIds.includes(CBC_TEST_ID);
    if (!hasCbc) return false;

    const mayoTestCount = assignments.filter(
      (a) => a.lab_name === MAYO_LAB_NAME
    ).length;
    return mayoTestCount === 1; // CBC is the sole Mayo test
  }, [assignments]);

  const handleApplyPromo = async () => {
    setPromoError(null);
    const code = promoInput.trim();
    if (!code) {
      setPromoError("Enter a promo code.");
      return;
    }
    setPromoSubmitting(true);
    try {
      const orgSlug =
        typeof window !== "undefined"
          ? window.localStorage.getItem("avovita-org-slug")
          : null;
      const res = await fetch("/api/checkout/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, orgSlug }),
      });
      const data = await res.json().catch(() => ({}));
      console.log("[promo] validate-promo response:", data);
      if (!res.ok) {
        setPromoError(data.error ?? "That promo code isn't valid.");
        onPromoChange(null);
        return;
      }
      const next: AppliedPromo = {
        promoId: data.promoId,
        code: data.code,
        percentOff:
          typeof data.percentOff === "number" ? data.percentOff : null,
        amountOff:
          typeof data.amountOff === "number" ? data.amountOff : null,
        currency: data.currency ?? null,
        name: data.name ?? null,
      };
      console.log("[promo] applying state:", next);
      onPromoChange(next);
      trackEvent("promo_code_applied", { code: data.code });
    } catch {
      setPromoError("Failed to validate promo code.");
      onPromoChange(null);
    } finally {
      setPromoSubmitting(false);
    }
  };

  const handleRemovePromo = () => {
    onPromoChange(null);
    setPromoInput("");
    setPromoError(null);
  };

  const canProceed =
    !submitting && (!showShippingRisk || shippingRiskAcknowledged);

  const handlePay = async () => {
    if (!canProceed) return;
    setSubmitting(true);
    setError(null);

    // Org affinity — set in localStorage by OrgProvider when the user
    // visited /org/[slug]/* or by CheckoutClient when the URL had
    // ?org_slug=. Server resolves slug → org_id and tags the order.
    let orgSlug: string | null = null;
    try {
      orgSlug =
        typeof window !== "undefined"
          ? window.localStorage.getItem("avovita-org-slug")
          : null;
    } catch {
      /* ignore */
    }

    // Detect if cart has non-test items. If so, route through
    // checkout-unified which handles all three line types.
    const hasSupplements = cart.some((i) => i.line_type === "supplement");
    const hasResources = cart.some((i) => i.line_type === "resource");
    const isMixedCart = hasSupplements || hasResources;

    try {
      if (isMixedCart) {
        // ── Mixed cart path: pending_order → checkout-unified ────
        const suppShippingFee =
          suppFulfillment === "shipping" ? SUPPLEMENT_SHIPPING_FEE_CAD : 0;
        const subtotalSupplements = cart
          .filter((i) => i.line_type === "supplement")
          .reduce((s, i) => s + i.price_cad * i.quantity, 0);
        const subtotalResources = cart
          .filter((i) => i.line_type === "resource")
          .reduce((s, i) => s + i.price_cad, 0);

        const pendingPayload: PendingOrderPayload = {
          version: 2,
          has_tests: true,
          has_supplements: hasSupplements,
          has_resources: hasResources,
          cart_items: cart,
          account_user_id: accountUserId,
          persons,
          test_assignments: assignments.map((a) => ({
            test_id: a.test_id,
            person_index: a.person_index,
            unit_price_cad: a.price_cad,
          })),
          collection_address: collectionAddress,
          visit_fees: {
            base: visitFees.base_fee,
            additional_per_person: visitFees.additional_fee_per_person,
            additional_count: visitFees.additional_person_count,
            total: visitFees.total,
          },
          order_mode: orderMode,
          representative:
            orderMode === "caregiver" ? representative : null,
          promo_code: appliedPromo?.code ?? null,
          org_id: orgSlug ?? null, // server resolves slug → id
          supplement_fulfillment: hasSupplements
            ? suppFulfillment
            : null,
          supplement_shipping_fee_cad: hasSupplements
            ? suppShippingFee
            : 0,
          supplement_shipping_address: hasSupplements
            ? suppShippingAddress
            : null,
          subtotal_tests: subtotal,
          subtotal_supplements: subtotalSupplements,
          subtotal_resources: subtotalResources,
          test_discount: discount.total,
          total:
            subtotal -
            discount.total +
            visitFees.total +
            subtotalSupplements +
            subtotalResources +
            suppShippingFee,
        };

        // 1. Create pending order
        const poRes = await fetch("/api/checkout/create-pending-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingPayload),
        });
        const poData = await poRes.json();
        if (!poRes.ok)
          throw new Error(poData.error ?? "Failed to create order");

        // 2. Create Stripe session via unified route
        const stripeRes = await fetch("/api/stripe/checkout-unified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pending_order_id: poData.pending_order_id,
          }),
        });
        const stripeData = await stripeRes.json();
        if (!stripeRes.ok)
          throw new Error(stripeData.error ?? "Checkout failed");

        window.location.href = stripeData.url;
      } else {
        // ── Pure test cart path: existing route (unchanged) ──────
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
          promo_code: appliedPromo?.code ?? undefined,
          promotion_code_id: appliedPromo?.promoId ?? null,
          representative:
            orderMode === "caregiver" ? representative : null,
        };

        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, org_slug: orgSlug }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Checkout failed");
        }
        const { url } = await res.json();
        window.location.href = url;
      }
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
          {supplementSubtotal > 0 && (
            <div
              className="flex justify-between pt-2 mt-1 border-t"
              style={{ color: "#e8d5a3", borderColor: "#2d6b35" }}
            >
              <span>Supplements</span>
              <span>{formatCurrency(supplementSubtotal)}</span>
            </div>
          )}
          {suppShippingFee > 0 && (
            <div
              className="flex justify-between"
              style={{ color: "#e8d5a3" }}
            >
              <span>Supplement shipping</span>
              <span>{formatCurrency(suppShippingFee)}</span>
            </div>
          )}
          {resourceSubtotal > 0 && (
            <div
              className="flex justify-between"
              style={{ color: "#e8d5a3" }}
            >
              <span>Resources</span>
              <span>{formatCurrency(resourceSubtotal)}</span>
            </div>
          )}
          {appliedPromo && promoDiscount > 0 && (
            <div
              className="flex justify-between font-medium pt-2 mt-1 border-t"
              style={{ color: "#8dc63f", borderColor: "#2d6b35" }}
            >
              <span>Promo code ({appliedPromo.code})</span>
              <span>−{formatCurrency(promoDiscount)}</span>
            </div>
          )}
          <div
            className="flex justify-between text-xl font-semibold pt-3 border-t mt-2"
            style={{ borderColor: "#2d6b35" }}
          >
            <span style={{ color: "#ffffff" }}>Grand Total</span>
            {appliedPromo && promoDiscount > 0 ? (
              <span className="flex items-center gap-2">
                <span
                  className="line-through text-base"
                  style={{ color: "#6ab04c" }}
                >
                  {formatCurrency(grossTotal)}
                </span>
                <span style={{ color: "#8dc63f" }}>
                  {formatCurrency(total)} CAD
                </span>
              </span>
            ) : (
              <span style={{ color: "#c4973a" }}>
                {formatCurrency(total)} CAD
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Promo code section */}
      {(
        <section
          className="rounded-lg border p-5 mb-5"
          style={{
            backgroundColor: "rgba(196, 151, 58, 0.1)",
            borderColor: "#c4973a",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4" style={{ color: "#c4973a" }} />
            <h4
              className="text-sm font-semibold"
              style={{ color: "#c4973a" }}
            >
              Promo Code
            </h4>
          </div>

          {appliedPromo ? (
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
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold"
                  style={{ color: "#8dc63f" }}
                >
                  Promo applied · {appliedPromo.code}
                  {appliedPromo.percentOff != null
                    ? ` — ${appliedPromo.percentOff}% off`
                    : appliedPromo.amountOff != null
                      ? ` — $${(appliedPromo.amountOff / 100).toFixed(2)} off`
                      : ""}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                  Discount will be applied at payment.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemovePromo}
                className="text-xs underline shrink-0"
                style={{ color: "#e8d5a3" }}
              >
                Remove
              </button>
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
                disabled={promoSubmitting}
                className="mf-btn-primary px-5 py-2 shrink-0"
              >
                {promoSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {promoSubmitting ? "Checking…" : "Apply"}
              </button>
            </div>
          )}
          {promoError && (
            <p className="text-xs mt-2" style={{ color: "#e05252" }}>
              {promoError}
            </p>
          )}
        </section>
      )}

      {/* ─── Shipping Risk Disclaimer ──────────────────────────────── */}
      {showShippingRisk && (
        <section
          className="rounded-lg border p-5 mb-5"
          style={{
            backgroundColor: "rgba(196, 151, 58, 0.1)",
            borderColor: "#c4973a",
          }}
        >
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle
              className="w-5 h-5 shrink-0 mt-0.5"
              style={{ color: "#c4973a" }}
            />
            <div>
              <h4
                className="text-sm font-semibold mb-2"
                style={{ color: "#c4973a" }}
              >
                Shipping Risk Acknowledgement
              </h4>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "#e8d5a3" }}
              >
                One or more tests in your order require time-sensitive
                specimen shipping via FedEx. In the rare event that a FedEx
                delay or failed delivery causes your specimen to exceed its
                stability window and become unusable, the test fee(s) for the
                affected test(s) will be refunded in full. However, the home
                visit fee is non-refundable as the collection service will
                have been performed. By checking this box you acknowledge and
                accept these terms.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShippingRiskAcknowledged((v) => !v)}
            className="flex items-start gap-2.5 w-full text-left cursor-pointer"
          >
            <span className="mt-0.5 shrink-0">
              {shippingRiskAcknowledged ? (
                <CheckSquare
                  className="w-5 h-5"
                  style={{ color: "#c4973a" }}
                />
              ) : (
                <Square
                  className="w-5 h-5"
                  style={{ color: "#6ab04c" }}
                />
              )}
            </span>
            <span
              className="text-sm font-medium"
              style={{
                color: shippingRiskAcknowledged ? "#c4973a" : "#e8d5a3",
              }}
            >
              I understand and accept the shipping risk policy
            </span>
          </button>
        </section>
      )}

      <p className="text-xs mb-5" style={{ color: "#6ab04c" }}>
        {appliedPromo && total <= 0
          ? "Promo zeroes the total — Stripe will record a $0.00 order and all notifications will fire normally."
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
          disabled={!canProceed}
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
