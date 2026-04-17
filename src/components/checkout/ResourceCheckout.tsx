"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { useCart } from "@/components/cart/CartContext";
import { OrgAwareHeader } from "@/components/org/OrgAwareHeader";
import { CheckoutCartSummary } from "./CheckoutCartSummary";
import { useAnalytics } from "@/lib/analytics/useAnalytics";
import { formatCurrency } from "@/lib/utils";
import { cartItemName } from "@/components/catalogue/types";
import type { PendingOrderPayload } from "@/lib/checkout/pending-order";

interface ResourceCheckoutProps {
  accountUserId: string | null;
  accountEmail: string | null;
}

/**
 * Minimal checkout for resource-only carts (no tests, no supplements).
 * Steps:
 *   1. Email + name
 *   2. Review + pay
 *
 * No address, no waiver, no fulfillment step.
 */
export function ResourceCheckout({
  accountUserId,
  accountEmail: _accountEmail,
}: ResourceCheckoutProps) {
  void _accountEmail;
  const router = useRouter();
  const { cart, hydrated } = useCart();
  const { trackEvent } = useAnalytics();

  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trackedStartRef = useRef(false);
  useEffect(() => {
    if (hydrated && cart.length > 0 && !trackedStartRef.current) {
      trackedStartRef.current = true;
      trackEvent("checkout_started");
    }
  }, [hydrated, cart.length, trackEvent]);

  useEffect(() => {
    if (hydrated && cart.length === 0) {
      router.replace("/resources");
    }
  }, [hydrated, cart.length, router]);

  if (!hydrated || cart.length === 0) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0a1a0d" }}
      >
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          Loading…
        </p>
      </div>
    );
  }

  const contactValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().includes("@");

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const subtotalResources = cart
        .filter((i) => i.line_type === "resource")
        .reduce((s, i) => s + i.price_cad, 0);

      const pendingPayload: PendingOrderPayload = {
        version: 2,
        has_tests: false,
        has_supplements: false,
        has_resources: true,
        cart_items: cart,
        account_user_id: accountUserId,
        contact_first_name: firstName.trim(),
        contact_last_name: lastName.trim(),
        contact_email: email.trim().toLowerCase(),
        subtotal_tests: 0,
        subtotal_supplements: 0,
        subtotal_resources: subtotalResources,
        test_discount: 0,
        total: subtotalResources,
      };

      const poRes = await fetch("/api/checkout/create-pending-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingPayload),
      });
      const poData = await poRes.json();
      if (!poRes.ok) throw new Error(poData.error ?? "Failed to create order");

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0a1a0d" }}>
      <OrgAwareHeader
        rightSlot={
          <Link
            href="/resources"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border whitespace-nowrap"
            style={{
              color: "#e8d5a3",
              borderColor: "#2d6b35",
              backgroundColor: "transparent",
            }}
          >
            ← Back to resources
          </Link>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Simple step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {["Contact", "Review"].map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: isDone
                      ? "#8dc63f"
                      : isActive
                        ? "#c4973a"
                        : "#2d6b35",
                    color: isDone || isActive ? "#0a1a0d" : "#6ab04c",
                  }}
                >
                  {stepNum}
                </div>
                <span
                  className="text-xs font-medium hidden sm:inline"
                  style={{ color: isActive ? "#c4973a" : "#6ab04c" }}
                >
                  {label}
                </span>
                {i < 1 && (
                  <div
                    className="w-8 h-px mx-1"
                    style={{ backgroundColor: "#2d6b35" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div>
            {/* Step 1: Contact */}
            {step === 1 && (
              <div>
                <h2
                  className="font-heading text-2xl font-semibold mb-2"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  Your <span style={{ color: "#c4973a" }}>Details</span>
                </h2>
                <div className="flex items-center gap-2 mb-6">
                  <Mail className="w-4 h-4" style={{ color: "#8dc63f" }} />
                  <p className="text-sm" style={{ color: "#e8d5a3" }}>
                    Your download link will be sent to this email after
                    purchase.
                  </p>
                </div>
                <div className="space-y-3 max-w-md">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        className="block text-xs font-medium mb-1"
                        style={{ color: "#e8d5a3" }}
                      >
                        First Name{" "}
                        <span style={{ color: "#e05252" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="mf-input"
                        autoComplete="given-name"
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-medium mb-1"
                        style={{ color: "#e8d5a3" }}
                      >
                        Last Name{" "}
                        <span style={{ color: "#e05252" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="mf-input"
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      className="block text-xs font-medium mb-1"
                      style={{ color: "#e8d5a3" }}
                    >
                      Email <span style={{ color: "#e05252" }}>*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mf-input"
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    disabled={!contactValid}
                    onClick={() => {
                      trackEvent("checkout_step_completed", { step: 1 });
                      setStep(2);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    style={{
                      backgroundColor: contactValid ? "#c4973a" : "#2d6b35",
                      color: contactValid ? "#0a1a0d" : "#6ab04c",
                      cursor: contactValid ? "pointer" : "not-allowed",
                    }}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Review */}
            {step === 2 && (
              <div>
                <h2
                  className="font-heading text-2xl font-semibold mb-6"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  Review Your{" "}
                  <span style={{ color: "#c4973a" }}>Order</span>
                </h2>

                <div
                  className="rounded-xl border p-4 mb-4 space-y-2"
                  style={{
                    backgroundColor: "#1a3d22",
                    borderColor: "#2d6b35",
                  }}
                >
                  {cart.map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-sm"
                    >
                      <span style={{ color: "#ffffff" }}>
                        {cartItemName(item)}
                      </span>
                      <span style={{ color: "#c4973a" }}>
                        {formatCurrency(item.price_cad)}
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  className="rounded-xl border p-4 mb-6"
                  style={{
                    backgroundColor: "#0f2614",
                    borderColor: "#2d6b35",
                  }}
                >
                  <p
                    className="text-xs uppercase tracking-wider font-semibold mb-2"
                    style={{ color: "#6ab04c" }}
                  >
                    Deliver to
                  </p>
                  <p className="text-sm" style={{ color: "#ffffff" }}>
                    {firstName} {lastName}
                  </p>
                  <p className="text-sm" style={{ color: "#e8d5a3" }}>
                    {email}
                  </p>
                  <p className="text-xs mt-2" style={{ color: "#8dc63f" }}>
                    Download link will be emailed after purchase
                  </p>
                </div>

                {error && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-lg text-sm border mb-4"
                    style={{
                      backgroundColor: "rgba(224, 82, 82, 0.12)",
                      borderColor: "#e05252",
                      color: "#e05252",
                    }}
                  >
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-5 py-2.5 rounded-lg text-sm font-semibold border"
                    style={{
                      color: "#e8d5a3",
                      borderColor: "#2d6b35",
                      backgroundColor: "transparent",
                    }}
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSubmit}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
                    style={{
                      backgroundColor: "#c4973a",
                      color: "#0a1a0d",
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    Pay Now
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="order-2 lg:order-none">
            <CheckoutCartSummary
              cart={cart}
              visitFees={null}
              lineCount={0}
              subtotalOverride={0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
