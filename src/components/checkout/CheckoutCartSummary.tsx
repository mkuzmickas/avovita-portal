"use client";

import { ShoppingBag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CatalogueCartItem } from "@/components/catalogue/types";
import type { VisitFees } from "@/lib/checkout/types";

interface CheckoutCartSummaryProps {
  cart: CatalogueCartItem[];
  /** Pass null on Step 1 (no people picked yet → no visit fee shown). */
  visitFees: VisitFees | null;
  /**
   * Multiplier for the test subtotal — by step 4 we know how many people
   * each test was assigned to. On earlier steps it's 1.
   */
  totalAssignmentsCount?: number;
}

/**
 * Right-rail order summary shown on every checkout step. Always shows
 * the catalogue price for each test (one entry per cart item, regardless
 * of how many people the test is later assigned to). Visit fee only
 * appears once we've collected the person count.
 */
export function CheckoutCartSummary({
  cart,
  visitFees,
}: CheckoutCartSummaryProps) {
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price_cad * item.quantity,
    0
  );
  const total = subtotal + (visitFees?.total ?? 0);

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
          <ul className="space-y-3 mb-4">
            {cart.map((item) => (
              <li
                key={item.test_id}
                className="flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium leading-snug"
                    style={{ color: "#ffffff" }}
                  >
                    {item.test_name}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "#6ab04c" }}
                  >
                    {item.lab_name}
                  </p>
                </div>
                <p
                  className="text-sm font-semibold whitespace-nowrap shrink-0"
                  style={{ color: "#c4973a" }}
                >
                  {formatCurrency(item.price_cad)}
                </p>
              </li>
            ))}
          </ul>

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

            <div
              className="flex justify-between text-base font-semibold pt-2 mt-1 border-t"
              style={{ borderColor: "#2d6b35" }}
            >
              <span style={{ color: "#ffffff" }}>Total</span>
              <span style={{ color: "#c4973a" }}>
                {formatCurrency(total)} CAD
              </span>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
