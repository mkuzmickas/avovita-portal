"use client";

import { useState } from "react";
import Link from "next/link";
import { Leaf, AlertCircle, Loader2, CheckCircle, Mail } from "lucide-react";

export default function LinkExpiredPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not send the link. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-md">
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
            Link expired
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#e8d5a3" }}>
            Sign-in links expire after a short time for your security.
          </p>
        </div>

        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          {sent ? (
            <div className="text-center py-2">
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
              <p className="text-sm" style={{ color: "#e8d5a3" }}>
                If an account exists for{" "}
                <strong style={{ color: "#ffffff" }}>{email}</strong>, we&apos;ve
                sent a fresh sign-in link. Look in your inbox (and spam folder
                — move it to your inbox before clicking).
              </p>
            </div>
          ) : (
            <form onSubmit={send} className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border p-3 text-xs" style={{ backgroundColor: "rgba(196,151,58,0.08)", borderColor: "#c4973a", color: "#e8d5a3" }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#c4973a" }} />
                <p>
                  Enter your email and we&apos;ll send a brand new sign-in link.
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
                disabled={submitting}
                className="mf-btn-primary w-full py-2.5"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <Mail className="w-4 h-4" />
                Email me a new link
              </button>
              <p className="text-center text-xs" style={{ color: "#6ab04c" }}>
                <Link href="/login" style={{ color: "#c4973a" }}>
                  Back to sign in
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
