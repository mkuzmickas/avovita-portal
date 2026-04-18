"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Leaf, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";

export default function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  void router;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    if (!lastName.trim()) {
      setError("Last name is required.");
      return;
    }

    // Phone validation: at least 7 digits after stripping formatting
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 7) {
      setError("Please enter a valid phone number.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/portal`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Save name + phone to accounts row (created by the on_auth_user_created trigger)
    if (data.user) {
      await supabase
        .from("accounts")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
        })
        .eq("id", data.user.id);
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: "#0a1a0d" }}
      >
        <div className="w-full max-w-md">
          <div
            className="rounded-2xl border p-6 sm:p-8 text-center"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
              style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
            >
              <CheckCircle className="w-7 h-7" style={{ color: "#8dc63f" }} />
            </div>
            <h2
              className="font-heading text-2xl font-semibold mb-2"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Check your email
            </h2>
            <p className="text-sm" style={{ color: "#e8d5a3" }}>
              We sent a confirmation link to <strong>{email}</strong>. Click the link
              to activate your account, then sign in.
            </p>
            <div
              className="mt-4 rounded-lg border p-3 text-left"
              style={{
                backgroundColor: "rgba(141, 198, 63, 0.08)",
                borderColor: "#2d6b35",
              }}
            >
              <p className="text-xs leading-relaxed" style={{ color: "#e8d5a3" }}>
                This email may have landed in your junk or spam folder. If so, please move it to your inbox before clicking the confirmation link — it may not work from the spam folder.
              </p>
            </div>
            <Link
              href="/login"
              className="mf-btn-primary mt-6 px-6"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
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
            Create Account
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#e8d5a3" }}>
            Join AvoVita for private lab testing in Calgary
          </p>
        </div>

        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  First name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                  className="mf-input"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  Last name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                  className="mf-input"
                />
              </div>
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

            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "#e8d5a3" }}
              >
                Phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                className="mf-input"
                placeholder="(403) 555-0123"
              />
              <p className="mt-1 text-xs" style={{ color: "#6ab04c" }}>
                Required for appointment coordination and order updates
              </p>
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
                Confirm Password
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
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

            <p className="text-xs" style={{ color: "#6ab04c" }}>
              By creating an account, you agree to our Terms of Service and acknowledge
              our Privacy Policy (Alberta PIPA). You will be asked to provide explicit
              consent before your health information is processed.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="mf-btn-primary w-full py-2.5"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Account
            </button>

            <p className="text-center text-sm" style={{ color: "#e8d5a3" }}>
              Already have an account?{" "}
              <Link href="/login" className="font-medium" style={{ color: "#c4973a" }}>
                Sign in
              </Link>
            </p>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#6ab04c" }}>
          Protected by Alberta PIPA · AvoVita Wellness
        </p>
      </div>
    </div>
  );
}
