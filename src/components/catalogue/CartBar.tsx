"use client";

import Link from "next/link";
import { ShoppingBag, ArrowRight, Tag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCart } from "@/components/cart/CartContext";
import { computeDiscount } from "@/lib/checkout/discount";
import type { CatalogueCartItem } from "./types";

interface CartBarProps {
  /**
   * Optional override — if not provided the bar reads from CartContext.
   * Kept as a prop so server-rendered pages can pass an explicit list.
   */
  cart?: CatalogueCartItem[];
}

export function CartBar({ cart: cartProp }: CartBarProps) {
  const ctx = useCart();
  const cart = cartProp ?? ctx.cart;

  if (cart.length === 0) return null;

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price_cad * item.quantity,
    0
  );

  // Pre-checkout preview: every cart item becomes at least one order line,
  // so cart.length is a safe lower bound for whether the discount applies.
  const discount = computeDiscount(cart.length);
  const totalAfterDiscount = subtotal - discount.total;

  return (
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
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-2">
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

      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
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

        <Link
          href="/checkout"
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          Proceed to Checkout
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
