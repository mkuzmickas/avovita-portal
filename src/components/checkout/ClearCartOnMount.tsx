"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/CartContext";

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
  }, [hydrated, clearCart]);

  return null;
}
