"use client";

import { Tag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeDiscount } from "@/lib/checkout/discount";
import { useRepeatClient } from "@/components/account/RepeatClientContext";

interface DiscountBannerProps {
  lineCount: number;
  className?: string;
  /**
   * Force-enable the discount even when the current session isn't a
   * repeat client — used by the quote-acceptance flow so a first-time
   * customer clicking Accept on an admin-priced quote still sees the
   * multi-test discount that was baked into the quote. Falls back to
   * the RepeatClient context otherwise.
   */
  forceEligible?: boolean;
}

/**
 * Green "reward" banner shown whenever the cart / order has 2+ lines
 * AND the current session is eligible for the discount (repeat client
 * OR force-enabled via forceEligible). Rendered in the catalogue cart,
 * the checkout sidebar, and inline on every step of the wizard.
 */
export function DiscountBanner({
  lineCount,
  className,
  forceEligible = false,
}: DiscountBannerProps) {
  const repeatClient = useRepeatClient();
  const eligible = forceEligible || repeatClient.eligible;
  const discount = computeDiscount(lineCount, eligible);
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
          Repeat-client discount applied — $20 off each test
        </p>
        <p className="text-xs mt-0.5 opacity-90">
          You&apos;re saving {formatCurrency(discount.total)} on this order.
        </p>
      </div>
    </div>
  );
}
