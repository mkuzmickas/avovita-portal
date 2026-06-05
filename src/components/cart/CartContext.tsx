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
import { computeKitServiceFee } from "@/lib/checkout/kit-service-fee";

const STORAGE_KEY = "avovita-cart-v1";

// ─── Schedule-restricted tests ───────────────────────────────────────
// Tests whose operational constraint (specimen stability + shipping
// window) requires booking on a specific day of the week. The cart
// shows a single acknowledgement modal when ANY restricted test is
// added; if the cart already holds one, the second add commits
// silently so one ack covers the rest of the session.
//
// Each entry carries its OWN modal copy so the Mayo-bound Tuesday-only
// tests (CBC, DCTR) and the R&E-bound Monday-or-Tuesday test (MELISA)
// can describe their day constraint + destination lab accurately
// without ifs in the modal body.
//
// Identifying by SKU keeps the registry readable; CBC stays on its
// historical test_id because nothing in code knows its SKU yet (the
// catalog row's SKU is whatever Mike entered manually).
const CBC_TEST_ID = "8e46bec5-526c-42be-909c-447235e9ecd0";

interface ScheduleAckEntry {
  /** Match by test_id OR sku — exactly one is set. */
  test_id?: string;
  sku?: string;
  display: string;
  /** Modal title — short headline mentioning the day constraint. */
  headline: string;
  /** Sentence rendered after "**{display}** ". Should end with a period. */
  intro: string;
  /** Bullet items under "Please be aware:". */
  bullets: string[];
}

// CBC + DCTR ship same-day to Mayo on Tuesday or the specimen times out.
// Shared copy because the operational risk is identical.
const TUESDAY_MAYO_INTRO =
  "requires a Tuesday collection only. The specimen has a 48-hour stability window and must ship same-day to Mayo Clinic Laboratories to meet stability requirements.";
const TUESDAY_MAYO_BULLETS = [
  "Your FloLabs appointment must be booked on a Tuesday",
  "FedEx shipping delays can cause the specimen to time out before reaching the lab — if this occurs, this test fee will be refunded but the home visit fee is non-refundable",
  "We strongly recommend ordering this test alongside others so your home visit fee is not wasted if the specimen is compromised in transit",
];

const SCHEDULE_ACK_TESTS: ScheduleAckEntry[] = [
  {
    test_id: CBC_TEST_ID,
    display: "Complete Blood Count (CBC)",
    headline: "Important — Tuesday-Only Collection Notice",
    intro: TUESDAY_MAYO_INTRO,
    bullets: TUESDAY_MAYO_BULLETS,
  },
  {
    sku: "DCTR",
    display: "Direct Antiglobulin Test (DCTR)",
    headline: "Important — Tuesday-Only Collection Notice",
    intro: TUESDAY_MAYO_INTRO,
    bullets: TUESDAY_MAYO_BULLETS,
  },
  {
    sku: "MELISA",
    display: "MELISA",
    headline: "Important — Monday or Tuesday Collection Notice",
    intro:
      "requires a Monday (non-holiday) or Tuesday collection only. The specimen ships to Western University in London, Ontario — the reference lab that runs MELISA testing on behalf of R&E Diagnostics — and must arrive within its stability window.",
    bullets: [
      "Your FloLabs appointment must be booked on a Monday (excluding statutory holidays) or Tuesday",
      "Shipping delays can cause the specimen to time out before reaching the lab — if this occurs, this test fee will be refunded but the home visit fee is non-refundable",
    ],
  },
];

function scheduleAckEntryFor(item: CartItemTest): ScheduleAckEntry | null {
  for (const entry of SCHEDULE_ACK_TESTS) {
    if (entry.test_id && item.test_id === entry.test_id) return entry;
    if (entry.sku && item.sku === entry.sku) return entry;
  }
  return null;
}

function hasScheduleAck(item: CartItem): item is CartItemTest {
  return item.line_type === "test" && scheduleAckEntryFor(item) !== null;
}

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
  kit_service_fee: number;
  kit_service_label: string;
  has_kit_tests: boolean;
  has_phlebotomist_tests: boolean;
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
  const kitFee = computeKitServiceFee(cart);

  const cart_total =
    subtotal_tests -
    test_discount +
    subtotal_supplements +
    subtotal_resources +
    kitFee.amount;

  return {
    testItems,
    supplementItems,
    resourceItems,
    subtotal_tests,
    subtotal_supplements,
    subtotal_resources,
    test_count,
    test_discount,
    kit_service_fee: kitFee.amount,
    kit_service_label: kitFee.label,
    has_kit_tests: kitFee.hasKitTests,
    has_phlebotomist_tests: kitFee.hasPhlebotomistTests,
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
 * Special case: schedule-restricted tests (CBC + DCTR Tuesday-only,
 * MELISA Monday-or-Tuesday) require an acknowledgement modal before
 * the item lands in the cart. One modal per cart-add cycle — if any
 * such test is already in the cart the subsequent add commits silently.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pendingScheduleAck, setPendingScheduleAck] =
    useState<CartItemTest | null>(null);

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
      // Schedule-restricted gate. Triggers the ack modal when adding
      // any entry in SCHEDULE_ACK_TESTS UNLESS the cart already contains
      // one — that ack covers the second add. Functional setPendingAck
      // and setCart (in commitAdd) avoid the stale-closure bug we
      // caught earlier: a clearCart() + addItem() sequence sees the
      // freshly-cleared cart, not the pre-clear one.
      if (item.line_type === "test" && scheduleAckEntryFor(item)) {
        setCart((prev) => {
          const alreadyAcked = prev.some(hasScheduleAck);
          if (alreadyAcked) {
            // Skip the modal but still commit the add. Use prev here
            // so we land in the same setCart pass — no race window.
            const id = cartItemId(item);
            if (prev.some((c) => cartItemId(c) === id)) return prev;
            return [...prev, item];
          }
          // Need ack — queue the item, modal will commit on confirm.
          setPendingScheduleAck((cur) => cur ?? item);
          return prev;
        });
        return;
      }
      // Resources: enforce quantity = 1
      if (item.line_type === "resource") {
        commitAdd({ ...item, quantity: 1 });
        return;
      }
      commitAdd(item);
    },
    [commitAdd],
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
        window.sessionStorage.removeItem("av-supps-modal-dismissed");
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
      {pendingScheduleAck && (
        <ScheduleAckModal
          item={pendingScheduleAck}
          onConfirm={() => {
            commitAdd(pendingScheduleAck);
            setPendingScheduleAck(null);
          }}
          onCancel={() => setPendingScheduleAck(null)}
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

// ─── Schedule-restricted acknowledgement modal ──────────────────────
//
// One modal renders any of the tests in SCHEDULE_ACK_TESTS. Headline,
// intro paragraph, and bullets all come from the matched entry so
// MELISA (Monday-or-Tuesday, R&E Diagnostics) and CBC/DCTR (Tuesday-
// only, Mayo) can each speak accurately about their own day
// constraint without conditionals here. If the customer has already
// added one of these tests in this session, the second add commits
// silently without re-showing.

function ScheduleAckModal({
  item,
  onConfirm,
  onCancel,
}: {
  item: CartItemTest;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const entry = scheduleAckEntryFor(item);
  const display = entry?.display ?? item.test_name;
  const headline = entry?.headline ?? "Important — Collection Notice";
  const intro = entry?.intro ?? "has scheduling restrictions for collection.";
  const bullets = entry?.bullets ?? [];
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
          {headline}
        </h2>
        <div className="space-y-3 text-sm" style={{ color: "#e8d5a3" }}>
          <p>
            <strong style={{ color: "#ffffff" }}>{display}</strong> {intro}
          </p>
          <p>Please be aware:</p>
          <ul className="space-y-1.5 list-none pl-0">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span style={{ color: "#c4973a" }}>•</span>
                <span>{b}</span>
              </li>
            ))}
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
            Remove from Order
          </button>
        </div>
      </div>
    </div>
  );
}
