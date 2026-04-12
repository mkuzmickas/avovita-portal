"use client";

import { useState } from "react";
import Link from "next/link";
import { Leaf, Loader2, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: "https://portal.avovita.ca/auth/confirm" }
    );

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <Leaf className="w-7 h-7" style={{ color: "#8dc63f" }} />
          </div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Reset your password
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#e8d5a3" }}>
            Enter your email address and we&apos;ll send you a link to reset
            your password.
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle
                className="w-12 h-12 mx-auto mb-4"
                style={{ color: "#8dc63f" }}
              />
              <h2
                className="font-heading text-xl font-semibold mb-2"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                Check your email
              </h2>
              <p className="text-sm mb-6" style={{ color: "#e8d5a3" }}>
                We sent a password reset link to{" "}
                <strong style={{ color: "#ffffff" }}>{email}</strong>. Click
                the link to set a new password.
              </p>
              <Link
                href="/login"
                className="mf-btn-primary px-6 py-2.5 inline-flex"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  required
                  autoComplete="email"
                  className="mf-input"
                  placeholder="you@example.com"
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
                disabled={loading}
                className="mf-btn-primary w-full py-2.5"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Reset Email
              </button>

              <p className="text-center text-sm" style={{ color: "#e8d5a3" }}>
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="font-medium"
                  style={{ color: "#c4973a" }}
                >
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#6ab04c" }}>
          Protected by Alberta PIPA · AvoVita Wellness
        </p>
      </div>
    </div>
  );
}
