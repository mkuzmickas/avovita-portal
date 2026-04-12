"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/CartContext";

/**
 * Zero-render component that clears the cart on mount. Placed at the
 * top of the checkout success page so the cart is wiped as soon as the
 * page loads — regardless of which onboarding step renders or whether
 * the user completes the flow.
 */
export function ClearCartOnMount() {
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
    // Also nuke the checkout wizard state
    try {
      window.localStorage.removeItem("avovita-checkout-v1");
    } catch {
      // ignore
    }
  }, [clearCart]);

  return null;
}
