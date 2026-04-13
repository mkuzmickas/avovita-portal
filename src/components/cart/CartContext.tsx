"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AlertTriangle } from "lucide-react";
import type { CatalogueCartItem } from "@/components/catalogue/types";

const STORAGE_KEY = "avovita-cart-v1";

const CBC_TEST_ID = "8e46bec5-526c-42be-909c-447235e9ecd0";

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
 *
 * Special case: the CBC test (id above) requires a Wednesday-only
 * collection due to Mayo Clinic same-day shipping requirements. When a
 * caller tries to add CBC, addItem stages the item instead of
 * committing — a modal at provider level asks the user to acknowledge
 * the constraint before the item lands in the cart.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CatalogueCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pendingCbc, setPendingCbc] = useState<CatalogueCartItem | null>(null);

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

  const commitAdd = useCallback((item: CatalogueCartItem) => {
    setCart((prev) => {
      if (prev.some((c) => c.test_id === item.test_id)) return prev;
      return [...prev, item];
    });
  }, []);

  const addItem = useCallback(
    (item: CatalogueCartItem) => {
      if (item.test_id === CBC_TEST_ID) {
        // If already in cart, no-op (matches commitAdd dedup behaviour)
        if (cart.some((c) => c.test_id === CBC_TEST_ID)) return;
        setPendingCbc(item);
        return;
      }
      commitAdd(item);
    },
    [cart, commitAdd]
  );

  const removeItem = useCallback((testId: string) => {
    setCart((prev) => prev.filter((c) => c.test_id !== testId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({ cart, addItem, removeItem, clearCart, hydrated }),
    [cart, addItem, removeItem, clearCart, hydrated]
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      {pendingCbc && (
        <CbcAcknowledgeModal
          onConfirm={() => {
            commitAdd(pendingCbc);
            setPendingCbc(null);
          }}
          onCancel={() => setPendingCbc(null)}
        />
      )}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return ctx;
}

// ─── CBC acknowledgement modal ────────────────────────────────────────

function CbcAcknowledgeModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Lock body scroll + Escape closes
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-6"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <AlertTriangle className="w-12 h-12" style={{ color: "#c4973a" }} />
        </div>
        <h2
          className="font-heading text-2xl font-semibold text-center mb-4"
          style={{
            color: "#c4973a",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Important — CBC Collection Notice
        </h2>
        <div className="space-y-3 text-sm" style={{ color: "#e8d5a3" }}>
          <p>
            The Complete Blood Count (CBC) requires a Wednesday collection only,
            as specimens must ship same-day to Mayo Clinic Laboratories to meet
            stability requirements.
          </p>
          <p>Please be aware:</p>
          <ul className="space-y-1.5 list-none pl-0">
            <li className="flex gap-2">
              <span style={{ color: "#c4973a" }}>•</span>
              <span>Your FloLabs appointment must be booked on a Wednesday</span>
            </li>
            <li className="flex gap-2">
              <span style={{ color: "#c4973a" }}>•</span>
              <span>
                FedEx shipping delays can cause the specimen to time out before
                reaching the lab — if this occurs, the CBC fee will be refunded
                but the home visit fee is non-refundable
              </span>
            </li>
            <li className="flex gap-2">
              <span style={{ color: "#c4973a" }}>•</span>
              <span>
                We strongly recommend ordering the CBC alongside other tests so
                your home visit fee is not wasted if the CBC specimen is
                compromised in transit
              </span>
            </li>
          </ul>
        </div>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            I Understand — Add to Cart
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 inline-flex items-center justify-center px-4 py-3 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              backgroundColor: "transparent",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            Remove CBC from Order
          </button>
        </div>
      </div>
    </div>
  );
}
