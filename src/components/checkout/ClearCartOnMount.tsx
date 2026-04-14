"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/CartContext";
import { clearOrgSession } from "@/components/org/OrgContext";

export function ClearCartOnMount() {
  const { clearCart, hydrated } = useCart();

  useEffect(() => {
    if (!hydrated) return;
    clearCart();
    try {
      window.localStorage.removeItem("avovita-checkout-v1");
    } catch {
      // ignore
    }
    // Drop the org-affinity tag so the next non-/org visit reverts to
    // standard AvoVita branding + untagged orders.
    clearOrgSession();
  }, [hydrated, clearCart]);

  return null;
}
