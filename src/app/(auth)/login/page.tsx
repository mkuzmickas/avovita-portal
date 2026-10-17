"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Leaf, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/portal";
  const msg = searchParams.get("msg");
  // Contextual info banner — set by callers like the shipping console's
  // "Back to Portal" button when a non-admin visitor tries to reach an
  // admin-only route. Distinct from `error` (auth failure) so it can
  // coexist without visual conflict.
  const infoBanner =
    msg === "admin_required"
      ? "Admin access required. Sign in with an AvoVita administrator account to view the portal."
      : null;

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
      // Most likely path for legacy customers: they auto-created an
      // account via checkout before passwords were mandatory and have
      // never set one. Magic-link sign-in was removed; the only
      // recovery is /forgot-password.
      const isCredentialError = /invalid.*credential/i.test(authError.message);
      setError(
        isCredentialError
          ? "Email or password didn't match. If you haven't set a password yet (older account), use \"Forgot password?\" above to set one."
          : authError.message,
      );
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {infoBanner && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-sm border"
          style={{
            backgroundColor: "rgba(196, 151, 58, 0.12)",
            borderColor: "#C6A04B",
            color: "#C6A04B",
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {infoBanner}
        </div>
      )}
      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "#154D31" }}
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
          <label className="block text-sm font-medium" style={{ color: "#154D31" }}>
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs"
            style={{ color: "#4a7a56" }}
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

      <p className="text-center text-sm" style={{ color: "#154D31" }}>
        Don&apos;t have an account?{" "}
        <Link href="/tests" className="font-medium" style={{ color: "#C6A04B" }}>
          Browse tests to get started
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#092819" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
            style={{ backgroundColor: "#092819", borderColor: "#E5E2D4" }}
          >
            <Leaf className="w-7 h-7" style={{ color: "#88D45D" }} />
          </div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#092819",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            AvoVita Wellness
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#154D31" }}>
            Sign in to your patient portal
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: "#092819", borderColor: "#E5E2D4" }}
        >
          <Suspense
            fallback={
              <div
                className="h-48 animate-pulse rounded-lg"
                style={{ backgroundColor: "#F7F6F0" }}
              />
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#4a7a56" }}>
          Protected by Alberta PIPA · AvoVita Wellness
        </p>
      </div>
    </div>
  );
}
