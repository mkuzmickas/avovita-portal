"use client";

import { ShoppingBag, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeDiscount } from "@/lib/checkout/discount";
import { DiscountBanner } from "./DiscountBanner";
import { useCart } from "@/components/cart/CartContext";
import { cartItemId, cartItemName } from "@/components/catalogue/types";
import type { CartItem } from "@/components/catalogue/types";
import type { VisitFees, AppliedPromo } from "@/lib/checkout/types";
import { calculateTotals } from "@/lib/checkout/totals";

interface CheckoutCartSummaryProps {
  cart: CartItem[];
  /** Null on Step 1 (person count not chosen yet → no visit fee shown). */
  visitFees: VisitFees | null;
  /**
   * Real order line count — `assignments.length` after Step 2, or a
   * safe lower bound of `cart.length` on Step 1.
   */
  lineCount?: number;
  /**
   * Pre-discount subtotal. On Step 1 this defaults to the sum of unique
   * cart items. On steps 2-4 CheckoutClient passes the real subtotal
   * computed from assignments (one billed line per assignment).
   */
  subtotalOverride?: number;
  /** Resolved Stripe promotion code applied to the order, if any. */
  appliedPromo?: AppliedPromo | null;
}

/**
 * Sticky right-rail order summary. Shows each cart item with its full
 * price, a per-line discount annotation when the multi-test discount
 * applies, and a totals block with subtotal → discount → visit fee →
 * grand total.
 */
export function CheckoutCartSummary({
  cart,
  visitFees,
  lineCount,
  subtotalOverride,
  appliedPromo = null,
}: CheckoutCartSummaryProps) {
  const { removeItem } = useCart();
  const testCount = cart.filter((i) => i.line_type === "test").length;
  const effectiveLineCount = lineCount ?? testCount;
  // For the per-line discount annotation we still need the discount
  // shape (per_line / applies). The authoritative totals come from
  // calculateTotals — same function the Step 4 pane uses.
  const discount = computeDiscount(effectiveLineCount);

  // Build a synthetic test-line price array so calculateTotals receives
  // the same shape regardless of caller. On Step 1 (before the user
  // picks a person count) we fall back to the cart, with one entry per
  // unique cart item (the multi-test discount uses .length).
  const cartLinePrices = cart.flatMap((item) =>
    Array.from({ length: item.quantity }, () => item.price_cad)
  );
  const testLinePrices =
    typeof subtotalOverride === "number" && lineCount
      ? Array.from({ length: lineCount }, (_, i) =>
          // Distribute subtotalOverride across `lineCount` rows for
          // calculation symmetry. When the caller supplies a real
          // assignment-derived subtotal + line count, the sum matches
          // exactly; otherwise this still preserves the per-line shape.
          i === 0 ? subtotalOverride - 0 : 0
        )
      : cartLinePrices;

  const totals = calculateTotals({
    testLinePrices,
    visitFee: visitFees?.total ?? 0,
    appliedPromo: appliedPromo ?? null,
  });
  if (typeof window !== "undefined") {
    console.log(
      "[CheckoutCartSummary] render — appliedPromo:",
      appliedPromo,
      "totals:",
      totals
    );
  }

  const subtotal = totals.testsSubtotal;
  const subtotalAfterDiscount = totals.subtotalAfterDiscount;
  const promoDiscount = totals.promoDiscount;
  const grossTotal = totals.subtotalAfterDiscount + totals.visitFee;
  const total = totals.grandTotal;

  return (
    <aside
      className="rounded-xl border p-5 sticky top-6"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <ShoppingBag className="w-4 h-4" style={{ color: "#c4973a" }} />
        <h2
          className="font-heading text-lg font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Order Summary
        </h2>
      </div>

      {cart.length === 0 ? (
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          Your cart is empty.
        </p>
      ) : (
        <>
          {/* Discount banner */}
          {discount.applies && (
            <div className="mb-4">
              <DiscountBanner lineCount={effectiveLineCount} />
            </div>
          )}

          {/* Line items with full price + per-line discount annotation */}
          <ul className="space-y-3 mb-4">
            {cart.map((item) => {
              const id = cartItemId(item);
              const name = cartItemName(item);
              const subtitle =
                item.line_type === "test"
                  ? item.lab_name
                  : item.line_type === "supplement"
                    ? "Supplement"
                    : "Resource";
              return (
              <li
                key={id}
                className="flex flex-col gap-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium leading-snug"
                      style={{ color: "#ffffff" }}
                    >
                      {name}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "#6ab04c" }}
                    >
                      {subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <p
                      className="text-sm font-semibold whitespace-nowrap"
                      style={{ color: "#c4973a" }}
                    >
                      {formatCurrency(item.price_cad)}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeItem(id)}
                      className="p-0.5 rounded transition-colors"
                      style={{ color: "#c4973a" }}
                      aria-label={`Remove ${name}`}
                      title="Remove from cart"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {discount.applies && item.line_type === "test" && (
                  <p
                    className="text-[11px] font-medium ml-0 sm:ml-0 text-right"
                    style={{ color: "#8dc63f" }}
                  >
                    −{formatCurrency(discount.per_line)} multi-test discount
                  </p>
                )}
              </li>
              );
            })}
          </ul>

          {/* Totals block */}
          <div
            className="space-y-1.5 pt-3 border-t"
            style={{ borderColor: "#2d6b35" }}
          >
            <div
              className="flex justify-between text-sm"
              style={{ color: "#e8d5a3" }}
            >
              <span>Tests subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            {discount.applies && (
              <>
                <div
                  className="flex justify-between text-sm font-medium"
                  style={{ color: "#8dc63f" }}
                >
                  <span>
                    Multi-test discount ({discount.line_count} ×{" "}
                    {formatCurrency(discount.per_line)})
                  </span>
                  <span>−{formatCurrency(discount.total)}</span>
                </div>
                <div
                  className="flex justify-between text-sm"
                  style={{ color: "#e8d5a3" }}
                >
                  <span>Subtotal after discount</span>
                  <span>{formatCurrency(subtotalAfterDiscount)}</span>
                </div>
              </>
            )}

            {visitFees ? (
              <>
                <div
                  className="flex justify-between text-sm"
                  style={{ color: "#e8d5a3" }}
                >
                  <span>Home visit (1st person)</span>
                  <span>{formatCurrency(visitFees.base_fee)}</span>
                </div>
                {visitFees.additional_person_count > 0 && (
                  <div
                    className="flex justify-between text-sm"
                    style={{ color: "#e8d5a3" }}
                  >
                    <span>
                      Additional × {visitFees.additional_person_count}
                    </span>
                    <span>
                      {formatCurrency(
                        visitFees.additional_fee_per_person *
                          visitFees.additional_person_count
                      )}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p
                className="text-xs italic pt-1"
                style={{ color: "#6ab04c" }}
              >
                Visit fee calculated after you choose how many people are
                included.
              </p>
            )}

            {appliedPromo && promoDiscount > 0 && (
              <div
                className="flex justify-between text-sm font-medium pt-2 mt-1 border-t"
                style={{ color: "#8dc63f", borderColor: "#2d6b35" }}
              >
                <span>Promo code ({appliedPromo.code})</span>
                <span>−{formatCurrency(promoDiscount)}</span>
              </div>
            )}

            <div
              className="flex justify-between text-base font-semibold pt-2 mt-1 border-t"
              style={{ borderColor: "#2d6b35" }}
            >
              <span style={{ color: "#ffffff" }}>Total</span>
              {appliedPromo && promoDiscount > 0 ? (
                <span className="flex items-center gap-2">
                  <span
                    className="line-through text-sm font-medium"
                    style={{ color: "#6ab04c" }}
                  >
                    {formatCurrency(grossTotal)}
                  </span>
                  <span style={{ color: "#8dc63f" }}>
                    {formatCurrency(total)} CAD
                  </span>
                </span>
              ) : (
                <span style={{ color: "#c4973a" }}>
                  {formatCurrency(total)} CAD
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
