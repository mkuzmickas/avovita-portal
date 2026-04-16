"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  ArrowRight,
  Leaf,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCart } from "@/components/cart/CartContext";
import { useAnalytics } from "@/lib/analytics/useAnalytics";
import { PasswordInput } from "@/components/PasswordInput";

interface OrderSummaryShape {
  orderIdShort: string;
  total: number;
  personCount: number;
  testCount: number;
  collectionCity: string;
  prefilledEmail: string;
}

interface CheckoutSuccessClientProps {
  sessionId: string;
  alreadyLoggedIn: boolean;
  summary: OrderSummaryShape;
}

/**
 * Client side of the post-purchase success page.
 *   - Always shows a gold success header.
 *   - For guests: collects a password and calls /api/auth/complete-purchase
 *     which creates the Supabase auth user, links the order, materialises
 *     profiles + order_lines, inserts consent rows, and sends the email.
 *   - For logged-in users: just shows "redirecting to portal" and bounces
 *     to /portal/orders after 2s.
 *
 * Clears the persisted cart + checkout wizard state from localStorage on
 * success so the next /tests visit starts fresh.
 */
export function CheckoutSuccessClient({
  sessionId,
  alreadyLoggedIn,
  summary,
}: CheckoutSuccessClientProps) {
  const router = useRouter();
  const { clearCart } = useCart();
  const { trackEvent } = useAnalytics();

  const [email, setEmail] = useState(summary.prefilledEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wipe cart + checkout state on mount — payment is done, no going back
  useEffect(() => {
    try {
      window.localStorage.removeItem("avovita-checkout-v1");
    } catch {
      // ignore
    }
    clearCart();
    trackEvent("checkout_step_completed", { step: 4 });
    trackEvent("order_completed", {
      order_id: summary.orderIdShort,
      total: summary.total,
    });
  }, [clearCart, trackEvent, summary.orderIdShort, summary.total]);

  // Logged-in users get auto-redirected
  useEffect(() => {
    if (alreadyLoggedIn) {
      const t = setTimeout(() => {
        router.push("/portal/orders");
        router.refresh();
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [alreadyLoggedIn, router]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || !confirm) {
      setError("Please fill in every field.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/complete-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create account");
      }

      // Sign in the new user on the client so the session cookie is set
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) {
        // Account exists and order is linked — they can log in manually
        router.push("/login?returnUrl=/portal/orders");
        return;
      }

      router.push("/portal");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create account"
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center border"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <Leaf className="w-5 h-5" style={{ color: "#8dc63f" }} />
          </div>
          <span
            className="font-heading text-2xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            AvoVita Wellness
          </span>
        </div>

        {/* Success card */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          {/* Gold header strip */}
          <div
            className="px-6 sm:px-8 py-7 text-center border-b"
            style={{
              backgroundColor: "#0f2614",
              borderColor: "#c4973a",
            }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-2"
              style={{
                backgroundColor: "rgba(196, 151, 58, 0.15)",
                borderColor: "#c4973a",
              }}
            >
              <CheckCircle
                className="w-9 h-9"
                style={{ color: "#c4973a" }}
              />
            </div>
            <h1
              className="font-heading text-3xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Order <span style={{ color: "#c4973a" }}>confirmed!</span>
            </h1>
            <p className="mt-2 text-sm" style={{ color: "#e8d5a3" }}>
              Order #{summary.orderIdShort} ·{" "}
              <span
                className="font-semibold"
                style={{ color: "#c4973a" }}
              >
                {formatCurrency(summary.total)} CAD
              </span>
            </p>
          </div>

          {/* Order summary */}
          <div
            className="px-6 sm:px-8 py-5 border-b"
            style={{ borderColor: "#2d6b35" }}
          >
            <h2
              className="text-xs uppercase tracking-wider font-semibold mb-3"
              style={{ color: "#6ab04c" }}
            >
              Summary
            </h2>
            <ul className="space-y-1 text-sm" style={{ color: "#e8d5a3" }}>
              <li>
                <strong style={{ color: "#ffffff" }}>{summary.testCount}</strong>{" "}
                test{summary.testCount !== 1 ? "s" : ""} for{" "}
                <strong style={{ color: "#ffffff" }}>
                  {summary.personCount}
                </strong>{" "}
                {summary.personCount === 1 ? "person" : "people"}
              </li>
              <li>
                Collection in{" "}
                <strong style={{ color: "#ffffff" }}>
                  {summary.collectionCity}
                </strong>{" "}
                — FloLabs will reach out to schedule
              </li>
            </ul>
          </div>

          {/* Account creation OR redirect message */}
          {alreadyLoggedIn ? (
            <div className="px-6 sm:px-8 py-8 text-center">
              <div className="flex items-center justify-center gap-2 text-sm mb-4">
                <Loader2
                  className="w-4 h-4 animate-spin"
                  style={{ color: "#c4973a" }}
                />
                <span style={{ color: "#e8d5a3" }}>
                  Taking you to your portal…
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push("/portal/orders")}
                className="mf-btn-secondary px-5 py-2.5"
              >
                Go now <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleCreateAccount}
              className="px-6 sm:px-8 py-6 space-y-4"
            >
              <div>
                <h2
                  className="font-heading text-xl font-semibold"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  Create Your <span style={{ color: "#c4973a" }}>Account</span>
                </h2>
                <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
                  An account is required to access your results securely.
                </p>
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mf-input"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  Password
                </label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mf-input"
                  required
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  Confirm Password
                </label>
                <PasswordInput
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mf-input"
                  required
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div
                  className="flex items-center gap-2 p-3 rounded-lg text-sm border"
                  style={{
                    backgroundColor: "rgba(224, 82, 82, 0.12)",
                    borderColor: "#e05252",
                    color: "#e05252",
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mf-btn-primary w-full py-3"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting
                  ? "Creating account…"
                  : "Create Account & Access Results"}
              </button>

              <p className="text-center text-xs" style={{ color: "#6ab04c" }}>
                Protected by Alberta PIPA · AvoVita Wellness
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
