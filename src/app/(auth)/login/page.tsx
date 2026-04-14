"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Leaf, Loader2, AlertCircle, Mail, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/portal";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Auto-created accounts have a random password the user never knows.
      // When credentials don't match, point them at the email-link option
      // instead of leaving them stuck on a generic auth error.
      const isCredentialError = /invalid.*credential/i.test(authError.message);
      setError(
        isCredentialError
          ? "Email or password didn't match. If you signed up via an order, you may not have set a password yet — use \"Email me a sign-in link\" below."
          : authError.message
      );
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  const sendMagicLink = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Enter your email above first, then click the magic link option.");
      return;
    }
    setMagicLoading(true);
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
      setMagicSent(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setMagicLoading(false);
    }
  };

  return (
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

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium" style={{ color: "#e8d5a3" }}>
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs"
            style={{ color: "#6ab04c" }}
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="mf-input"
          placeholder="••••••••"
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
        Sign In
      </button>

      {magicSent ? (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-sm border"
          style={{
            backgroundColor: "rgba(141, 198, 63, 0.12)",
            borderColor: "#8dc63f",
            color: "#8dc63f",
          }}
        >
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            If an account exists for that email, we&apos;ve sent a sign-in link.
            Check your inbox (and spam folder).
          </span>
        </div>
      ) : (
        <div
          className="border-t pt-3 text-center"
          style={{ borderColor: "#2d6b35" }}
        >
          <p className="text-xs mb-2" style={{ color: "#6ab04c" }}>
            Don&apos;t have a password yet? (Auto-created accounts from a
            previous order)
          </p>
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={magicLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              backgroundColor: "transparent",
              borderColor: "#c4973a",
              color: "#c4973a",
              opacity: magicLoading ? 0.6 : 1,
            }}
          >
            {magicLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            Email me a sign-in link
          </button>
        </div>
      )}

      <p className="text-center text-sm" style={{ color: "#e8d5a3" }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium" style={{ color: "#c4973a" }}>
          Create account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
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
            AvoVita Wellness
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#e8d5a3" }}>
            Sign in to your patient portal
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <Suspense
            fallback={
              <div
                className="h-48 animate-pulse rounded-lg"
                style={{ backgroundColor: "#0f2614" }}
              />
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#6ab04c" }}>
          Protected by Alberta PIPA · AvoVita Wellness
        </p>
      </div>
    </div>
  );
}
