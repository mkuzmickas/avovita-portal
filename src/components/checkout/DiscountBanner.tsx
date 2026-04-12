"use client";

import { Tag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeDiscount } from "@/lib/checkout/discount";

interface DiscountBannerProps {
  lineCount: number;
  className?: string;
}

/**
 * Green "reward" banner shown whenever the cart / order has 2+ lines.
 * Rendered in the catalogue cart, the checkout sidebar, and inline on
 * every step of the wizard.
 */
export function DiscountBanner({ lineCount, className }: DiscountBannerProps) {
  const discount = computeDiscount(lineCount);
  if (!discount.applies) return null;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 ${className ?? ""}`}
      style={{
        backgroundColor: "#1a3d22",
        borderColor: "#8dc63f",
        color: "#8dc63f",
      }}
      role="status"
    >
      <Tag className="w-4 h-4 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold leading-snug">
          Multi-test discount applied — $20 off each test
        </p>
        <p className="text-xs mt-0.5 opacity-90">
          You&apos;re saving {formatCurrency(discount.total)} on this order.
        </p>
      </div>
    </div>
  );
}
