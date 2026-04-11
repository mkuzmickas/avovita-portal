"use client";

import { useState } from "react";
import { X, Trash2, Loader2, ShoppingBag, LogIn } from "lucide-react";
import Link from "next/link";
import { formatCurrency, calculateVisitFees } from "@/lib/utils";
import { VisitFeeCalculator } from "@/components/VisitFeeCalculator";
import type { CartItem, PatientProfile } from "@/types/database";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  profiles: PatientProfile[];
  selectedProfileId: string | null;
  onSelectProfile: (id: string) => void;
  onRemoveItem: (testId: string, profileId: string) => void;
  isLoggedIn: boolean;
}

export function CartDrawer({
  open,
  onClose,
  cartItems,
  profiles,
  onRemoveItem,
  isLoggedIn,
}: CartDrawerProps) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const visitFeeBreakdowns = calculateVisitFees(cartItems, profiles);
  const totalVisitFees = visitFeeBreakdowns.reduce((s, b) => s + b.total_fee, 0);
  const subtotal = cartItems.reduce(
    (s, item) => s + item.test.price_cad * item.quantity,
    0
  );
  const total = subtotal + totalVisitFees;

  const handleCheckout = async () => {
    setCheckingOut(true);
    setCheckoutError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            test_id: item.test.id,
            profile_id: item.profile_id,
            quantity: item.quantity,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Checkout failed");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed");
      setCheckingOut(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
        onClick={onClose}
      />

      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col border-l"
        style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "#1a3d22" }}
        >
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" style={{ color: "#c4973a" }} />
            <h2
              className="font-heading text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Your Cart ({cartItems.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "#e8d5a3" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {cartItems.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag
                className="w-12 h-12 mx-auto mb-3"
                style={{ color: "#2d6b35" }}
              />
              <p style={{ color: "#6ab04c" }}>Your cart is empty.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {cartItems.map((item) => {
                  const profile = profiles.find((p) => p.id === item.profile_id);
                  return (
                    <div
                      key={`${item.test.id}-${item.profile_id}`}
                      className="flex items-start gap-3 p-3 rounded-xl border"
                      style={{
                        backgroundColor: "#1a3d22",
                        borderColor: "#2d6b35",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "#ffffff" }}
                        >
                          {item.test.name}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                          {item.test.lab.name}
                          {profile && (
                            <span>
                              {" "}
                              · {profile.first_name} {profile.last_name}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: "#c4973a" }}
                        >
                          {formatCurrency(item.test.price_cad)}
                        </span>
                        <button
                          onClick={() =>
                            onRemoveItem(item.test.id, item.profile_id)
                          }
                          className="p-1 rounded-lg transition-colors"
                          style={{ color: "#6ab04c" }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <VisitFeeCalculator
                breakdowns={visitFeeBreakdowns}
                totalVisitFees={totalVisitFees}
              />

              {/* Summary */}
              <div
                className="rounded-xl border p-4 space-y-2"
                style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
              >
                <div
                  className="flex justify-between text-sm"
                  style={{ color: "#e8d5a3" }}
                >
                  <span>Tests Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div
                  className="flex justify-between text-sm"
                  style={{ color: "#e8d5a3" }}
                >
                  <span>
                    Home Visit Fee{visitFeeBreakdowns.length > 1 ? "s" : ""}
                  </span>
                  <span>{formatCurrency(totalVisitFees)}</span>
                </div>
                <div
                  className="flex justify-between font-semibold pt-2 border-t"
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
        </div>

        {cartItems.length > 0 && (
          <div
            className="px-6 py-4 border-t space-y-3"
            style={{ borderColor: "#1a3d22" }}
          >
            {checkoutError && (
              <p className="text-sm" style={{ color: "#e05252" }}>
                {checkoutError}
              </p>
            )}

            {isLoggedIn ? (
              <button
                onClick={handleCheckout}
                disabled={checkingOut}
                className="mf-btn-primary w-full py-3 text-base"
              >
                {checkingOut && <Loader2 className="w-4 h-4 animate-spin" />}
                {checkingOut ? "Redirecting to payment…" : "Proceed to Checkout"}
              </button>
            ) : (
              <Link
                href="/login?redirectTo=/tests"
                className="mf-btn-primary w-full py-3 text-base"
              >
                <LogIn className="w-4 h-4" />
                Sign In to Checkout
              </Link>
            )}
            <p className="text-center text-xs" style={{ color: "#6ab04c" }}>
              Secure payment via Stripe · CAD only
            </p>
          </div>
        )}
      </div>
    </>
  );
}
