"use client";

import { ShoppingCart, Clock, Building2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { TestWithLab, CartItem } from "@/types/database";

interface TestCardProps {
  test: TestWithLab;
  cartItems: CartItem[];
  selectedProfileId: string | null;
  onAddToCart: (test: TestWithLab) => void;
  className?: string;
}

export function TestCard({
  test,
  cartItems,
  selectedProfileId,
  onAddToCart,
  className,
}: TestCardProps) {
  const inCart = cartItems.some(
    (item) =>
      item.test.id === test.id &&
      (selectedProfileId ? item.profile_id === selectedProfileId : true)
  );

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors duration-200 overflow-hidden flex flex-col",
        className
      )}
      style={{
        backgroundColor: "#1a3d22",
        borderColor: "#2d6b35",
      }}
    >
      <div className="px-5 pt-5">
        {test.category && (
          <span className="mf-badge-category mb-3">
            {test.category}
          </span>
        )}
        <h3
          className="font-heading text-xl font-semibold leading-tight"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          {test.name}
        </h3>
      </div>

      <div className="px-5 mt-2">
        <div className="flex items-center gap-1.5 text-sm" style={{ color: "#e8d5a3" }}>
          <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#8dc63f" }} />
          <span>{test.lab.name}</span>
          {test.lab.cross_border_country && (
            <span
              className="text-xs font-medium ml-1"
              style={{ color: "#c4973a" }}
            >
              · International
            </span>
          )}
        </div>
      </div>

      {test.description && (
        <p
          className="px-5 mt-3 text-sm line-clamp-2 flex-1"
          style={{ color: "#e8d5a3" }}
        >
          {test.description}
        </p>
      )}

      {test.turnaround_display && (
        <div
          className="px-5 mt-3 flex items-center gap-1.5 text-sm"
          style={{ color: "#e8d5a3" }}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: "#8dc63f" }} />
          <span>{test.turnaround_display}</span>
        </div>
      )}

      <div
        className="px-5 py-4 mt-4 border-t flex items-center justify-between gap-3"
        style={{ borderColor: "#2d6b35" }}
      >
        <p className="text-2xl font-semibold" style={{ color: "#c4973a" }}>
          {formatCurrency(test.price_cad)}
          <span
            className="text-xs font-normal ml-1"
            style={{ color: "#e8d5a3" }}
          >
            CAD
          </span>
        </p>

        <button
          onClick={() => onAddToCart(test)}
          disabled={inCart}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={
            inCart
              ? {
                  backgroundColor: "#1f4a28",
                  color: "#8dc63f",
                  border: "1px solid #2d6b35",
                }
              : {
                  backgroundColor: "#c4973a",
                  color: "#0a1a0d",
                }
          }
        >
          <ShoppingCart className="w-4 h-4" />
          {inCart ? "In Cart" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
