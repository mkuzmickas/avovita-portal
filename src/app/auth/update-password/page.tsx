"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Leaf,
  Loader2,
  AlertCircle,
  CheckCircle,
  KeyRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";

/**
 * Lands here after a password-reset email link is clicked. Supabase has
 * already verified the recovery token and put `#access_token=…&type=
 * recovery` in the URL hash; the browser client auto-detects it and
 * sets the session. We just need to ask for a new password and call
 * supabase.auth.updateUser({ password }).
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [authState, setAuthState] = useState<
    "checking" | "ready" | "no_session"
  >("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Wait for the supabase client to finish processing the URL hash on
  // mount. onAuthStateChange fires with PASSWORD_RECOVERY when the
  // recovery token is consumed, or we already have a session if the
  // page was visited with a fresh token.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthState(data.session ? "ready" : "no_session");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setAuthState("ready");
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setSubmitting(false);
      return;
    }
    setDone(true);
    setSubmitting(false);
    setTimeout(() => {
      router.push("/portal");
      router.refresh();
    }, 1500);
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
            Set a new password
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#e8d5a3" }}>
            Choose a strong password you&apos;ll remember.
          </p>
        </div>

        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          {authState === "checking" && (
            <div className="flex items-center justify-center py-10">
              <Loader2
                className="w-6 h-6 animate-spin"
                style={{ color: "#c4973a" }}
              />
            </div>
          )}

          {authState === "no_session" && (
            <div className="text-center py-4">
              <AlertCircle
                className="w-10 h-10 mx-auto mb-3"
                style={{ color: "#e05252" }}
              />
              <h2
                className="font-heading text-xl font-semibold mb-2"
                style={{ color: "#ffffff" }}
              >
                Link expired or invalid
              </h2>
              <p className="text-sm mb-6" style={{ color: "#e8d5a3" }}>
                Reset links expire after a short time. Please request a fresh
                one from the forgot-password page.
              </p>
              <Link
                href="/forgot-password"
                className="mf-btn-primary px-6 py-2.5 inline-flex"
              >
                Request a new link
              </Link>
            </div>
          )}

          {authState === "ready" && done && (
            <div className="text-center py-4">
              <CheckCircle
                className="w-12 h-12 mx-auto mb-4"
                style={{ color: "#8dc63f" }}
              />
              <h2
                className="font-heading text-xl font-semibold mb-2"
                style={{ color: "#ffffff" }}
              >
                Password updated
              </h2>
              <p className="text-sm" style={{ color: "#e8d5a3" }}>
                Redirecting you to your portal…
              </p>
            </div>
          )}

          {authState === "ready" && !done && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  New password
                </label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="mf-input"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  Confirm new password
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="mf-input"
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
                {submitting && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <KeyRound className="w-4 h-4" />
                Update password
              </button>
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
