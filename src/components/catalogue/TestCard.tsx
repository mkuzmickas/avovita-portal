"use client";

import { useState } from "react";
import { Clock, ShoppingCart, Check, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CatalogueTest, CatalogueCartItem } from "./types";

interface TestCardProps {
  test: CatalogueTest;
  inCart: boolean;
  onAdd: (item: CatalogueCartItem) => void;
  /** Controlled by parent — when true, the chevron rotates and label flips. */
  expanded?: boolean;
}

export function TestCard({
  test,
  inCart,
  onAdd,
  expanded = false,
}: TestCardProps) {
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    // Stop click-to-expand from firing when the user hits Add to Cart.
    e.stopPropagation();
    if (inCart || justAdded) return;
    onAdd({
      test_id: test.id,
      test_name: test.name,
      price_cad: test.price_cad,
      lab_name: test.lab.name,
      quantity: 1,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  const showInCart = inCart || justAdded;

  return (
    <article
      className="flex flex-col rounded-xl border overflow-hidden transition-colors h-full"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="px-5 pt-5 pb-4 flex-1 flex flex-col">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
            style={{
              backgroundColor: "#0f2614",
              borderColor: "#8dc63f",
              color: "#8dc63f",
            }}
          >
            {test.lab.name}
          </span>
          {test.category && (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#c4973a",
                color: "#c4973a",
              }}
            >
              {test.category}
            </span>
          )}
        </div>

        {/* Test name */}
        <h3
          className="font-heading font-semibold leading-tight mb-3"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: "20px",
          }}
        >
          {test.name}
        </h3>

        {/* Price */}
        <p
          className="font-semibold mb-2"
          style={{ color: "#c4973a", fontSize: "26px" }}
        >
          {formatCurrency(test.price_cad)}
          <span
            className="text-xs font-normal ml-1.5"
            style={{ color: "#e8d5a3" }}
          >
            CAD
          </span>
        </p>

        {/* Turnaround */}
        {test.turnaround_display && (
          <div
            className="flex items-center gap-1.5 text-xs mb-4"
            style={{ color: "#e8d5a3" }}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: "#8dc63f" }} />
            <span>{test.turnaround_display}</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Add to cart */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={showInCart}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={
            showInCart
              ? {
                  backgroundColor: "rgba(141, 198, 63, 0.15)",
                  color: "#8dc63f",
                  border: "1px solid #8dc63f",
                  cursor: "default",
                }
              : {
                  backgroundColor: "#c4973a",
                  color: "#0a1a0d",
                }
          }
        >
          {showInCart ? (
            <>
              <Check className="w-4 h-4" />
              In Cart
            </>
          ) : (
            <>
              <ShoppingCart className="w-4 h-4" />
              Add to Cart
            </>
          )}
        </button>

        {/* View Details indicator */}
        <div
          className="flex items-center justify-center gap-1 mt-3 text-xs font-medium select-none"
          style={{ color: "rgba(196, 151, 58, 0.75)" }}
        >
          <span>{expanded ? "Hide Details" : "View Details"}</span>
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform duration-200"
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </div>

    </article>
  );
}
