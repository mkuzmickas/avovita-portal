"use client";

import { useCart } from "@/components/cart/CartContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { CheckoutClient } from "./CheckoutClient";
import { SupplementCheckout } from "./SupplementCheckout";
import { ResourceCheckout } from "./ResourceCheckout";

interface CheckoutRouterProps {
  accountUserId: string | null;
  accountEmail: string | null;
}

/**
 * Composition-aware checkout router. Reads cart composition once and
 * renders the appropriate checkout variant:
 *
 *   has_tests     → TestCheckout (existing CheckoutClient) with
 *                    conditional supplement/resource step injection
 *   supplements   → SupplementCheckout (simplified flow)
 *   resources     → ResourceCheckout (minimal flow — email only)
 *   empty cart    → redirect to /tests (fail-safe)
 *
 * Unknown line_types are ignored (fail closed to test-only behavior).
 */
export function CheckoutRouter({
  accountUserId,
  accountEmail,
}: CheckoutRouterProps) {
  const { cart, hydrated } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  // When ?quote=AVO-... is present the cart is expected to be empty on
  // first load — CheckoutClient's deep-link effect will populate it
  // from the quote. Suppress the empty-cart redirect in that case so
  // that effect gets a chance to run.
  const hasQuoteParam = searchParams.get("quote") !== null;

  // Cart composition — fail-safe: unknown line_types are ignored
  const hasTests = cart.some((i) => i.line_type === "test");
  const hasSupplements = cart.some((i) => i.line_type === "supplement");
  const hasResources = cart.some((i) => i.line_type === "resource");

  // Empty cart redirect (fail-safe)
  useEffect(() => {
    if (hasQuoteParam) return;
    if (hydrated && cart.length === 0) {
      router.replace("/tests");
    }
  }, [hydrated, cart.length, router, hasQuoteParam]);

  if (!hydrated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0a1a0d" }}
      >
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          Loading checkout…
        </p>
      </div>
    );
  }

  if (cart.length === 0 && !hasQuoteParam) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0a1a0d" }}
      >
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          Redirecting to catalogue…
        </p>
      </div>
    );
  }

  // ?quote= deep-link → always route to CheckoutClient so its effect
  // can resolve the quote and populate the cart.
  if (hasQuoteParam) {
    return (
      <CheckoutClient
        accountUserId={accountUserId}
        accountEmail={accountEmail}
        showSupplementFulfillmentStep={hasSupplements}
        showResourceSuccessNotice={hasResources}
      />
    );
  }

  // Route by composition
  if (hasTests) {
    // Tests present (with or without supplements/resources) → full test flow
    return (
      <CheckoutClient
        accountUserId={accountUserId}
        accountEmail={accountEmail}
        showSupplementFulfillmentStep={hasSupplements}
        showResourceSuccessNotice={hasResources}
      />
    );
  }

  if (hasSupplements) {
    // Supplements only (possibly with resources, no tests)
    return (
      <SupplementCheckout
        accountUserId={accountUserId}
        accountEmail={accountEmail}
        showResourceSuccessNotice={hasResources}
      />
    );
  }

  if (hasResources) {
    // Resources only — minimal flow
    return (
      <ResourceCheckout
        accountUserId={accountUserId}
        accountEmail={accountEmail}
      />
    );
  }

  // Fallback: cart has items with unknown line_type → treat as tests
  return (
    <CheckoutClient
      accountUserId={accountUserId}
      accountEmail={accountEmail}
      showSupplementFulfillmentStep={false}
      showResourceSuccessNotice={false}
    />
  );
}
