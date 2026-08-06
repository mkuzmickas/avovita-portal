"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight, Tag, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCart } from "@/components/cart/CartContext";
import { useOrg } from "@/components/org/OrgContext";
import type { CartItem } from "./types";

interface CartBarProps {
  /**
   * Optional override — if not provided the bar reads from CartContext.
   * Kept as a prop so server-rendered pages can pass an explicit list.
   */
  cart?: CartItem[];
}

interface ActiveAdvisory {
  id: string;
  message: string;
  headline: string | null;
  activeUntil: string;
}

export function CartBar({ cart: cartProp }: CartBarProps) {
  const ctx = useCart();
  const cart = cartProp ?? ctx.cart;
  const { totals } = ctx;
  const org = useOrg();
  const router = useRouter();
  const checkoutHref = org
    ? `/checkout?org_slug=${encodeURIComponent(org.slug)}`
    : "/checkout";

  // Active availability advisory (holiday closures, coverage gaps, …).
  // Driven from the availability_advisories Supabase table via
  // /api/site/advisory. Fetched on mount only — the cart bar re-renders
  // often as items go in and out, but the advisory itself changes on
  // the order of hours/days, so one fetch per session is plenty.
  const [advisory, setAdvisory] = useState<ActiveAdvisory | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site/advisory")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.advisory) setAdvisory(data.advisory);
      })
      .catch(() => {
        /* silent — advisory display is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (cart.length === 0) return null;

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal =
    totals.subtotal_tests + totals.subtotal_supplements + totals.subtotal_resources;
  const discount = totals.test_discount > 0
    ? { applies: true, total: totals.test_discount }
    : { applies: false, total: 0 };
  const totalAfterDiscount = totals.cart_total;

  // "Add one more test to save \$20 per test" nudge — surfaces at the
  // exact moment the customer is one add away from unlocking the
  // discount. Only when they've got exactly one test in the cart AND
  // the discount isn't already applied. Previously this lived as a
  // static pill on /tests where it was invisible at the decision
  // moment. Test-count = testItems.length (not itemCount, which
  // counts supplements + resources too).
  const showSingleTestNudge =
    !discount.applies && totals.testItems.length === 1;

  return (
    <>
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur"
      style={{
        backgroundColor: "rgba(15, 38, 20, 0.96)",
        borderColor: "#2d6b35",
      }}
    >
      {/* Amber availability advisory strip — surfaces above the cart
          summary when an admin has an active advisory window queued
          in the availability_advisories Supabase table. Rendered here
          (not on /tests) because the constraint only becomes
          actionable once the customer has decided to order — before
          then it's an apology-shaped notice on the landing surface
          and hurts conversion. */}
      {advisory && (
        <div
          className="border-b"
          style={{ borderColor: "#c4973a", backgroundColor: "#2a2416" }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-start gap-2">
            <AlertTriangle
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{ color: "#c4973a" }}
            />
            <p
              className="text-xs sm:text-sm leading-relaxed"
              style={{ color: "#e8d5a3" }}
            >
              <strong style={{ color: "#c4973a" }}>
                {advisory.headline ?? "Important"}:
              </strong>{" "}
              {advisory.message}
            </p>
          </div>
        </div>
      )}

      {/* Green discount banner strip — appears above the main bar */}
      {discount.applies && (
        <div
          className="border-b"
          style={{ borderColor: "#8dc63f", backgroundColor: "#1a3d22" }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2">
            <Tag className="w-4 h-4 shrink-0" style={{ color: "#8dc63f" }} />
            <p
              className="text-xs sm:text-sm font-semibold"
              style={{ color: "#8dc63f" }}
            >
              Multi-test discount applied — $20 off each test · You&apos;re
              saving {formatCurrency(discount.total)}
            </p>
          </div>
        </div>
      )}

      {/* Single-test upsell — one add away from the multi-test discount.
          Rendered where it's actionable (the cart) rather than as a
          static promo pill on /tests where nobody was reading it. */}
      {showSingleTestNudge && (
        <div
          className="border-b"
          style={{ borderColor: "#c4973a", backgroundColor: "#1a3d22" }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2">
            <Tag className="w-4 h-4 shrink-0" style={{ color: "#c4973a" }} />
            <p
              className="text-xs sm:text-sm font-semibold"
              style={{ color: "#c4973a" }}
            >
              Add one more test to save $20 on each — same home visit,
              same appointment.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center border shrink-0"
            style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
          >
            <ShoppingBag className="w-5 h-5" style={{ color: "#c4973a" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#ffffff" }}>
              {itemCount} {itemCount === 1 ? "item" : "items"} in cart
            </p>
            {discount.applies ? (
              <p className="text-xs" style={{ color: "#e8d5a3" }}>
                <span
                  className="line-through opacity-70"
                  style={{ color: "#6ab04c" }}
                >
                  {formatCurrency(subtotal)}
                </span>{" "}
                <span className="font-semibold" style={{ color: "#c4973a" }}>
                  {formatCurrency(totalAfterDiscount)} CAD
                </span>{" "}
                <span style={{ color: "#8dc63f" }}>
                  (−{formatCurrency(discount.total)})
                </span>
              </p>
            ) : (
              <p className="text-xs" style={{ color: "#e8d5a3" }}>
                Subtotal{" "}
                <span className="font-semibold" style={{ color: "#c4973a" }}>
                  {formatCurrency(subtotal)} CAD
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => router.push(checkoutHref)}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          Proceed to Checkout
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
    </>
  );
}

