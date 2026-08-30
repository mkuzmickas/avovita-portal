"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight, Tag, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCart } from "@/components/cart/CartContext";
import { useRepeatClient } from "@/components/account/RepeatClientContext";
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
  const repeatClient = useRepeatClient();
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

  // Publish the CartBar's height as a CSS variable so floating siblings
  // (the "Check available dates" FAB, in-page toasts, etc.) can offset
  // above it instead of colliding on mobile.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const publish = () => {
      const h = el.offsetHeight;
      document.documentElement.style.setProperty(
        "--cart-bar-height",
        `${h}px`,
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--cart-bar-height");
    };
  }, [cart.length]);

  if (cart.length === 0) return null;

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal =
    totals.subtotal_tests + totals.subtotal_supplements + totals.subtotal_resources;
  const discount = totals.test_discount > 0
    ? { applies: true, total: totals.test_discount }
    : { applies: false, total: 0 };
  const totalAfterDiscount = totals.cart_total;

  // "Add one more test to save $20 per test" nudge — surfaces at the
  // exact moment a REPEAT client is one add away from unlocking the
  // discount. Only when they've got exactly one test in the cart, the
  // discount isn't already applied, AND they qualify for the discount
  // in the first place (repeat client). Guests + first-time customers
  // never see this pill because the discount isn't available to them.
  // Test-count = testItems.length (not itemCount, which counts
  // supplements + resources too).
  const showSingleTestNudge =
    repeatClient.eligible &&
    !discount.applies &&
    totals.testItems.length === 1;

  // Guest sign-in nudge — surfaces the repeat-client discount as a
  // reason to sign in without spending words on non-eligible logged-in
  // first-timers (who see nothing, per Mike's call: no need to rub
  // "you don't qualify" in their face on their first order).
  const showGuestSignInNudge =
    !repeatClient.loading && !repeatClient.loggedIn;

  return (
    <>
    <div
      ref={barRef}
      className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur"
      style={{
        backgroundColor: "rgba(15, 38, 20, 0.96)",
        borderColor: "#2d6b35",
        // Reserve iOS safe-area at the bottom so the Proceed button
        // isn't tappable in the bottom-edge gesture zone that summons
        // Safari's URL bar.
        paddingBottom: "env(safe-area-inset-bottom)",
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

      {/* Guest sign-in nudge — muted-gold strip pitching the repeat-
          client discount as a sign-in incentive. Only shown to guests;
          logged-in first-timers see nothing to avoid signalling "you
          don't qualify" on their first order. */}
      {showGuestSignInNudge && (
        <div
          className="border-b"
          style={{ borderColor: "#c4973a", backgroundColor: "#1a3d22" }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2">
            <Tag className="w-4 h-4 shrink-0" style={{ color: "#c4973a" }} />
            <p
              className="text-xs sm:text-sm"
              style={{ color: "#e8d5a3" }}
            >
              <Link
                href="/login"
                className="font-semibold underline"
                style={{ color: "#c4973a" }}
              >
                Sign in
              </Link>{" "}
              — repeat clients receive additional discounts at checkout.
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
              Repeat-client discount applied — $20 off each test · You&apos;re
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

