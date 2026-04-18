"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight, Tag, X, Pill } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCart } from "@/components/cart/CartContext";
import { useOrg } from "@/components/org/OrgContext";
import { isSupplementsEnabled } from "@/types/supplements";
import type { CartItem } from "./types";

interface CartBarProps {
  /**
   * Optional override — if not provided the bar reads from CartContext.
   * Kept as a prop so server-rendered pages can pass an explicit list.
   */
  cart?: CartItem[];
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
  const [showSuppsModal, setShowSuppsModal] = useState(false);

  if (cart.length === 0) return null;

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal =
    totals.subtotal_tests + totals.subtotal_supplements + totals.subtotal_resources;
  const discount = totals.test_discount > 0
    ? { applies: true, total: totals.test_discount }
    : { applies: false, total: 0 };
  const totalAfterDiscount = totals.cart_total;

  return (
    <>
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur"
      style={{
        backgroundColor: "rgba(15, 38, 20, 0.96)",
        borderColor: "#2d6b35",
      }}
    >
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
          onClick={() => {
            // Show "Browse supplements?" modal if:
            // 1. Feature flag is on
            // 2. Cart has NO supplements
            const hasSupplement = cart.some(
              (i) => i.line_type === "supplement",
            );
            if (isSupplementsEnabled() && !hasSupplement) {
              setShowSuppsModal(true);
              return;
            }
            router.push(checkoutHref);
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          Proceed to Checkout
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>

    {/* "Browse supplements?" modal — rendered as sibling of the cart
        bar (not inside it) so the fixed-inset backdrop covers the
        full viewport without being clipped by the cart bar's own
        fixed positioning. */}
    {showSuppsModal && (
      <BrowseSupplementsModal
        onBrowse={() => {
          setShowSuppsModal(false);
          router.push("/supplements");
        }}
        onContinue={() => {
          setShowSuppsModal(false);
          router.push(checkoutHref);
        }}
        onClose={() => setShowSuppsModal(false)}
      />
    )}
    </>
  );
}

// ─── "Browse Supplements?" pre-checkout modal ─────────────────────────

function BrowseSupplementsModal({
  onBrowse,
  onContinue,
  onClose,
}: {
  onBrowse: () => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  // ESC to dismiss (same as "No thanks")
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Browse supplements before checkout"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center border"
              style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
            >
              <Pill className="w-5 h-5" style={{ color: "#c4973a" }} />
            </div>
            <h2
              className="font-heading text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Before you check out
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md"
            style={{ color: "#e8d5a3" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm mb-6" style={{ color: "#e8d5a3" }}>
          Would you like to browse our supplements first? We offer a curated
          selection of practitioner-grade supplements.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onBrowse}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            Browse supplements
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              backgroundColor: "transparent",
              borderColor: "#8dc63f",
              color: "#8dc63f",
            }}
          >
            No thanks, continue to checkout
          </button>
        </div>
      </div>
    </div>
  );
}
