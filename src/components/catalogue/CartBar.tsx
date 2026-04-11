"use client";

import Link from "next/link";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CatalogueCartItem } from "./types";

interface CartBarProps {
  cart: CatalogueCartItem[];
}

export function CartBar({ cart }: CartBarProps) {
  if (cart.length === 0) return null;

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price_cad * item.quantity,
    0
  );

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur"
      style={{
        backgroundColor: "rgba(15, 38, 20, 0.96)",
        borderColor: "#2d6b35",
      }}
    >
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
            <p className="text-xs" style={{ color: "#e8d5a3" }}>
              Subtotal{" "}
              <span className="font-semibold" style={{ color: "#c4973a" }}>
                {formatCurrency(subtotal)} CAD
              </span>
            </p>
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
