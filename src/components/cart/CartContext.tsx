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
import type {
  CartItem,
  CartItemTest,
  CatalogueCartItem,
} from "@/components/catalogue/types";
import { cartItemId } from "@/components/catalogue/types";
import { computeDiscount } from "@/lib/checkout/discount";

const STORAGE_KEY = "avovita-cart-v1";

const CBC_TEST_ID = "8e46bec5-526c-42be-909c-447235e9ecd0";

// ─── Cart calculations ─────────────────────────────────────────────────

export interface CartTotals {
  testItems: CartItemTest[];
  supplementItems: CartItem[];
  resourceItems: CartItem[];
  subtotal_tests: number;
  subtotal_supplements: number;
  subtotal_resources: number;
  test_count: number;
  test_discount: number;
  cart_total: number;
}

function computeCartTotals(cart: CartItem[]): CartTotals {
  const testItems = cart.filter(
    (i): i is CartItemTest => i.line_type === "test",
  );
  const supplementItems = cart.filter((i) => i.line_type === "supplement");
  const resourceItems = cart.filter((i) => i.line_type === "resource");

  const subtotal_tests = testItems.reduce(
    (s, i) => s + i.price_cad * i.quantity,
    0,
  );
  const subtotal_supplements = supplementItems.reduce(
    (s, i) => s + i.price_cad * i.quantity,
    0,
  );
  const subtotal_resources = resourceItems.reduce(
    (s, i) => s + i.price_cad,
    0,
  );

  const test_count = testItems.length;
  const discount = computeDiscount(test_count);
  const test_discount = discount.total;

  const cart_total =
    subtotal_tests -
    test_discount +
    subtotal_supplements +
    subtotal_resources;

  return {
    testItems,
    supplementItems,
    resourceItems,
    subtotal_tests,
    subtotal_supplements,
    subtotal_resources,
    test_count,
    test_discount,
    cart_total,
  };
}

// ─── Legacy migration ──────────────────────────────────────────────────
// Old cart items have no line_type. Backfill to 'test' on hydration.

function migrateCartItems(raw: unknown[]): CartItem[] {
  return raw.map((item) => {
    const obj = item as Record<string, unknown>;
    if (obj.line_type) return obj as unknown as CartItem;
    // Legacy CatalogueCartItem → CartItemTest
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.debug("[cart] Migrated legacy cart item to line_type: 'test'");
    }
    return {
      line_type: "test" as const,
      test_id: obj.test_id as string,
      test_name: obj.test_name as string,
      price_cad: obj.price_cad as number,
      lab_name: obj.lab_name as string,
      quantity: (obj.quantity as number) ?? 1,
    };
  });
}

// ─── Context ───────────────────────────────────────────────────────────

interface CartContextValue {
  cart: CartItem[];
  totals: CartTotals;
  addItem: (item: CartItem) => void;
  /** @deprecated Use addItem with a full CartItem instead. */
  addTestItem: (item: CatalogueCartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Cart provider — single source of truth for the public catalogue cart.
 * Accepts three line types: 'test', 'supplement', 'resource'.
 *
 * Persists to localStorage. Hydration is two-phase: first render is
 * always an empty cart so server + client markup match, then useEffect
 * reads localStorage. Legacy items without line_type are backfilled
 * to 'test' on hydration.
 *
 * Special case: the CBC test requires a Wednesday-only collection modal
 * before the item lands in the cart (line_type='test' only).
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pendingCbc, setPendingCbc] = useState<CartItemTest | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCart(migrateCartItems(parsed));
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

  const commitAdd = useCallback((item: CartItem) => {
    const id = cartItemId(item);
    setCart((prev) => {
      if (prev.some((c) => cartItemId(c) === id)) return prev;
      return [...prev, item];
    });
  }, []);

  const addItem = useCallback(
    (item: CartItem) => {
      // CBC gate — only for tests
      if (
        item.line_type === "test" &&
        item.test_id === CBC_TEST_ID
      ) {
        if (cart.some((c) => cartItemId(c) === `test:${CBC_TEST_ID}`))
          return;
        setPendingCbc(item);
        return;
      }
      // Resources: enforce quantity = 1
      if (item.line_type === "resource") {
        commitAdd({ ...item, quantity: 1 });
        return;
      }
      commitAdd(item);
    },
    [cart, commitAdd],
  );

  /**
   * @deprecated Backwards-compatible wrapper for existing catalogue pages
   * that still pass CatalogueCartItem (which is CartItemTest).
   */
  const addTestItem = useCallback(
    (item: CatalogueCartItem) => {
      const testItem: CartItemTest = {
        ...item,
        line_type: "test",
      };
      addItem(testItem);
    },
    [addItem],
  );

  const removeItem = useCallback((id: string) => {
    setCart((prev) => prev.filter((c) => cartItemId(c) !== id));
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

  const totals = useMemo(() => computeCartTotals(cart), [cart]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      totals,
      addItem,
      addTestItem,
      removeItem,
      clearCart,
      hydrated,
    }),
    [cart, totals, addItem, addTestItem, removeItem, clearCart, hydrated],
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
