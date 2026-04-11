"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CatalogueCartItem } from "@/components/catalogue/types";

const STORAGE_KEY = "avovita-cart-v1";

interface CartContextValue {
  cart: CatalogueCartItem[];
  addItem: (item: CatalogueCartItem) => void;
  removeItem: (testId: string) => void;
  clearCart: () => void;
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Cart provider — single source of truth for the public catalogue cart.
 * Persists to localStorage so the cart survives navigation between
 * /tests, /checkout, and back. Hydration is two-phase: first render is
 * always an empty cart so server + client markup match, then a
 * useEffect reads localStorage and replaces the state.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CatalogueCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CatalogueCartItem[];
        if (Array.isArray(parsed)) {
          setCart(parsed);
        }
      }
    } catch {
      // localStorage parse error — start with empty cart
    }
    setHydrated(true);
  }, []);

  // Persist on every change (after initial hydration)
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Storage quota exceeded or disabled — silently ignore
    }
  }, [cart, hydrated]);

  const addItem = useCallback((item: CatalogueCartItem) => {
    setCart((prev) => {
      if (prev.some((c) => c.test_id === item.test_id)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((testId: string) => {
    setCart((prev) => prev.filter((c) => c.test_id !== testId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({ cart, addItem, removeItem, clearCart, hydrated }),
    [cart, addItem, removeItem, clearCart, hydrated]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return ctx;
}
