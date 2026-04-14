"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Leaf,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle,
  Calendar,
  ExternalLink,
  FlaskConical,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ProfileForm } from "@/components/portal/ProfileForm";
import { WaiverForm } from "@/components/portal/WaiverForm";
import { PasswordInput } from "@/components/PasswordInput";

const FLO_LABS_URL =
  "https://flolabsbooking.as.me/?appointmentType=84416067";

export interface OnboardingPerson {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  biological_sex: string;
  relationship: string | null;
  is_account_holder: boolean;
  phone?: string | null;
}

export interface OnboardingAssignment {
  test_name: string;
  lab_name: string;
  specimen_type: string | null;
  requires_fasting: boolean;
  person_index: number;
}

export interface OnboardingCollectionAddress {
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
}

export interface OnboardingSummary {
  sessionId: string;
  orderIdShort: string;
  total: number;
  prefilledEmail: string;
  persons: OnboardingPerson[];
  assignments: OnboardingAssignment[];
  collectionCity: string;
  collectionAddress: OnboardingCollectionAddress;
}

interface PostPurchaseOnboardingProps {
  /** True when the user was already logged in at time of Stripe checkout. */
  alreadyLoggedIn: boolean;
  /** True when the user already has a profile on their account. */
  hasProfile: boolean;
  /** True when waiver_completed = true on their account. */
  waiverDone: boolean;
  summary: OnboardingSummary;
}

type Step = 1 | 2 | 3 | 4;

export function PostPurchaseOnboarding({
  alreadyLoggedIn,
  hasProfile,
  waiverDone,
  summary,
}: PostPurchaseOnboardingProps) {
  const router = useRouter();

  // Determine starting step based on existing state. For !alreadyLoggedIn
  // we render a separate "check your email" card below before any of the
  // step-driven UI runs, so initialStep is irrelevant in that case.
  const initialStep: Step = useMemo(() => {
    if (!hasProfile) return 2;
    if (!waiverDone) return 3;
    return 4;
  }, [hasProfile, waiverDone]);

  const [step, setStep] = useState<Step>(initialStep);

  // Guests no longer set a password here — the webhook auto-creates the
  // account and emails a magic confirmation link. Show a simple success
  // card and let them activate from their inbox.
  if (!alreadyLoggedIn) {
    return <GuestCheckEmailCard summary={summary} />;
  }

  const stepLabels = ["Create Account", "Your Information", "Sign Waiver", "Book Collection"];

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-6 sm:py-10"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-2xl">
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

        {/* Progress bar */}
        <ol className="flex items-center gap-1 sm:gap-2 mb-8 px-1 overflow-x-auto">
          {stepLabels.map((label, idx) => {
            const stepNum = (idx + 1) as Step;
            const completed = step > stepNum;
            const active = step === stepNum;
            const isLast = idx === stepLabels.length - 1;

            return (
              <li
                key={idx}
                className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold border-2 shrink-0"
                    style={{
                      backgroundColor:
                        completed || active ? "#c4973a" : "#0f2614",
                      borderColor:
                        completed || active ? "#c4973a" : "#2d6b35",
                      color: completed || active ? "#0a1a0d" : "#6ab04c",
                    }}
                  >
                    {completed ? <Check className="w-4 h-4" /> : stepNum}
                  </span>
                  <span
                    className="text-xs sm:text-sm font-medium truncate hidden sm:inline"
                    style={{
                      color: active
                        ? "#ffffff"
                        : completed
                        ? "#c4973a"
                        : "#6ab04c",
                    }}
                  >
                    {label}
                  </span>
                </div>
                {!isLast && (
                  <span
                    aria-hidden
                    className="h-0.5 flex-1 rounded-full"
                    style={{
                      backgroundColor: completed ? "#c4973a" : "#2d6b35",
                      minWidth: 12,
                    }}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Card */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          {step === 1 && (
            <Step1CreateAccount
              sessionId={summary.sessionId}
              prefilledEmail={summary.prefilledEmail}
              onComplete={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2YourInfo
              accountHolderPerson={summary.persons.find(
                (p) => p.is_account_holder
              )}
              collectionAddress={summary.collectionAddress}
              onComplete={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <div className="px-5 sm:px-8 py-6 sm:py-8">
              <WaiverForm onComplete={() => setStep(4)} />
            </div>
          )}
          {step === 4 && (
            <Step4BookCollection
              summary={summary}
              onPortal={() => {
                router.push("/portal");
                router.refresh();
              }}
            />
          )}
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "#6ab04c" }}
        >
          Protected by Alberta PIPA · AvoVita Wellness
        </p>
      </div>
    </div>
  );
}

// ─── Step 1: Create Account ─────────────────────────────────────────

function Step1CreateAccount({
  sessionId,
  prefilledEmail,
  onComplete,
}: {
  sessionId: string;
  prefilledEmail: string;
  onComplete: () => void;
}) {
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
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

      // Sign in the new user so the session cookie is set
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signInWithPassword({ email, password });

      onComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create account"
      );
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="px-5 sm:px-8 py-6 sm:py-8 space-y-4"
    >
      <div>
        <h2
          className="font-heading text-2xl sm:text-3xl font-semibold mb-2"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Create your <span style={{ color: "#c4973a" }}>AvoVita account</span>
        </h2>
        <p className="text-sm" style={{ color: "#e8d5a3" }}>
          Your account gives you secure access to your results and order
          history.
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
          readOnly={!!prefilledEmail}
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
        {submitting ? "Creating account…" : "Create Account"}
      </button>
    </form>
  );
}

// ─── Step 2: Your Information ───────────────────────────────────────

function Step2YourInfo({
  accountHolderPerson,
  collectionAddress,
  onComplete,
}: {
  accountHolderPerson: OnboardingPerson | undefined;
  collectionAddress: OnboardingCollectionAddress;
  onComplete: () => void;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      setLoading(false);
    };
    load();
  }, []);

  // Build prefill data from the checkout metadata so the patient
  // doesn't have to re-enter their name / DOB / sex / address.
  const hasPrefill = !!(
    accountHolderPerson?.first_name && accountHolderPerson?.last_name
  );

  const prefillProfile = useMemo(() => {
    if (!accountHolderPerson) return undefined;
    return {
      first_name: accountHolderPerson.first_name,
      last_name: accountHolderPerson.last_name,
      date_of_birth: accountHolderPerson.date_of_birth,
      biological_sex: accountHolderPerson.biological_sex as
        | "male"
        | "female"
        | "intersex",
      phone: accountHolderPerson.phone ?? null,
      address_line1: collectionAddress.address_line1 || null,
      address_line2: collectionAddress.address_line2 || null,
      city: collectionAddress.city || null,
      province: collectionAddress.province || "AB",
      postal_code: collectionAddress.postal_code || null,
    };
  }, [accountHolderPerson, collectionAddress]);

  if (loading || !userId) {
    return (
      <div className="px-8 py-12 text-center">
        <Loader2
          className="w-6 h-6 animate-spin mx-auto mb-2"
          style={{ color: "#c4973a" }}
        />
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 sm:px-8 py-6 sm:py-8">
      <div className="mb-6">
        <h2
          className="font-heading text-2xl sm:text-3xl font-semibold mb-2"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Tell us about <span style={{ color: "#c4973a" }}>yourself</span>
        </h2>
        <p className="text-sm" style={{ color: "#e8d5a3" }}>
          This information is used for specimen collection and your lab
          results.
        </p>
      </div>

      {/* Pre-fill banner */}
      {hasPrefill && (
        <div
          className="flex items-start gap-2.5 rounded-lg border px-4 py-3 mb-5"
          style={{
            backgroundColor: "#1a3d22",
            borderColor: "#2d6b35",
          }}
        >
          <CheckCircle
            className="w-4 h-4 shrink-0 mt-0.5"
            style={{ color: "#8dc63f" }}
          />
          <p className="text-sm" style={{ color: "#e8d5a3" }}>
            We&apos;ve pre-filled your information from your order — please
            review and confirm.
          </p>
        </div>
      )}

      <ProfileForm
        accountId={userId}
        isPrimary
        prefillData={prefillProfile}
        submitLabel={hasPrefill ? "Confirm and Continue" : undefined}
        onSuccess={() => onComplete()}
      />
    </div>
  );
}

// ─── Step 4: Book Collection ────────────────────────────────────────

function Step4BookCollection({
  summary,
  onPortal,
}: {
  summary: OnboardingSummary;
  onPortal: () => void;
}) {
  // Group assignments by person
  const assignmentsByPerson = useMemo(() => {
    const map = new Map<number, OnboardingAssignment[]>();
    for (const p of summary.persons) {
      const idx = summary.persons.indexOf(p);
      map.set(idx, []);
    }
    for (const a of summary.assignments) {
      map.get(a.person_index)?.push(a);
    }
    return map;
  }, [summary]);

  const hasFasting = summary.assignments.some((a) => a.requires_fasting);

  return (
    <div className="px-5 sm:px-8 py-8 sm:py-10">
      {/* Success header */}
      <div className="text-center mb-8">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 border-2"
          style={{
            backgroundColor: "rgba(196, 151, 58, 0.15)",
            borderColor: "#c4973a",
          }}
        >
          <CheckCircle className="w-9 h-9" style={{ color: "#c4973a" }} />
        </div>
        <h2
          className="font-heading text-3xl sm:text-4xl font-semibold mb-2"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          You&apos;re <span style={{ color: "#c4973a" }}>all set!</span>
        </h2>
        <p className="text-sm" style={{ color: "#e8d5a3" }}>
          Your order is confirmed and your waiver is on file. The last step
          is to book your in-home collection appointment with FloLabs.
        </p>
      </div>

      {/* Order summary by person */}
      <div className="space-y-3 mb-6">
        {summary.persons.map((person, idx) => {
          const tests = assignmentsByPerson.get(idx) ?? [];
          return (
            <div
              key={idx}
              className="rounded-lg border p-4"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#2d6b35",
              }}
            >
              <p
                className="text-sm font-semibold mb-2"
                style={{ color: "#ffffff" }}
              >
                {person.first_name} {person.last_name}
                {!person.is_account_holder && person.relationship && (
                  <span
                    className="font-normal text-xs ml-2"
                    style={{ color: "#6ab04c" }}
                  >
                    · {person.relationship.replace("_", " ")}
                  </span>
                )}
              </p>
              <ul className="space-y-1">
                {tests.map((t, ti) => (
                  <li
                    key={ti}
                    className="flex items-center gap-2 text-xs"
                    style={{ color: "#e8d5a3" }}
                  >
                    <FlaskConical
                      className="w-3 h-3 shrink-0"
                      style={{ color: "#8dc63f" }}
                    />
                    <span>{t.test_name}</span>
                    {t.specimen_type && (
                      <span style={{ color: "#6ab04c" }}>
                        · {t.specimen_type}
                      </span>
                    )}
                    {t.requires_fasting && (
                      <span
                        className="font-semibold"
                        style={{ color: "#c4973a" }}
                      >
                        · Fasting
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Fasting warning */}
      {hasFasting && (
        <div
          className="flex items-start gap-2.5 rounded-lg border p-4 mb-6"
          style={{
            backgroundColor: "rgba(196, 151, 58, 0.1)",
            borderColor: "#c4973a",
          }}
        >
          <AlertTriangle
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: "#c4973a" }}
          />
          <div>
            <p
              className="text-sm font-semibold mb-1"
              style={{ color: "#c4973a" }}
            >
              Fasting required
            </p>
            <p className="text-xs" style={{ color: "#e8d5a3" }}>
              One or more of your tests require 8–12 hours of fasting
              before collection. Only water is permitted during the fasting
              window. Please schedule your appointment accordingly.
            </p>
          </div>
        </div>
      )}

      {/* Book FloLabs CTA */}
      <a
        href={FLO_LABS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mf-btn-primary w-full py-3.5 text-base mb-3"
      >
        <Calendar className="w-5 h-5" />
        Book Your FloLabs Appointment
        <ExternalLink className="w-4 h-4" />
      </a>
      <p
        className="text-xs text-center mb-8"
        style={{ color: "#6ab04c" }}
      >
        FloLabs will come to your collection address at your chosen time.
        Please have your collection address ready when booking.
      </p>

      {/* What happens next */}
      <div
        className="rounded-xl border p-5 mb-6"
        style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
      >
        <h3
          className="font-heading text-lg font-semibold mb-3"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          What happens next
        </h3>
        <ol className="space-y-3 text-sm" style={{ color: "#e8d5a3" }}>
          {[
            "FloLabs visits your collection address and draws your specimens.",
            "AvoVita ships your specimens to the laboratory.",
            "Your results are uploaded to your portal — you'll receive an email and text when ready.",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border"
                style={{
                  backgroundColor: "#1a3d22",
                  borderColor: "#2d6b35",
                  color: "#c4973a",
                }}
              >
                {i + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Portal link */}
      <button
        type="button"
        onClick={onPortal}
        className="w-full text-center text-sm font-medium py-2"
        style={{ color: "#c4973a" }}
      >
        Go to my portal →
      </button>
    </div>
  );
}

// ─── Guest "check your email" success card ──────────────────────────────

function GuestCheckEmailCard({ summary }: { summary: OnboardingSummary }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-xl text-center">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center border"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <Leaf className="w-5 h-5" style={{ color: "#8dc63f" }} />
          </div>
          <span
            className="font-heading text-xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            AvoVita Wellness
          </span>
        </div>

        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
            style={{ backgroundColor: "#0f2614", borderColor: "#8dc63f" }}
          >
            <CheckCircle className="w-7 h-7" style={{ color: "#8dc63f" }} />
          </div>
          <h1
            className="font-heading text-2xl sm:text-3xl font-semibold mb-2"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Your order is <span style={{ color: "#c4973a" }}>confirmed</span>
          </h1>
          <p className="text-sm mb-1" style={{ color: "#e8d5a3" }}>
            Order #{summary.orderIdShort} ·{" "}
            <span style={{ color: "#c4973a", fontWeight: 600 }}>
              {formatCurrency(summary.total)} CAD
            </span>
          </p>
          <p
            className="text-sm mt-5 leading-relaxed"
            style={{ color: "#e8d5a3" }}
          >
            We&apos;ve sent a confirmation email to{" "}
            <strong style={{ color: "#ffffff" }}>
              {summary.prefilledEmail || "your inbox"}
            </strong>
            . Start by confirming your email, then complete your profile and
            waiver to prepare for your appointment.
          </p>
          <div
            className="mt-5 rounded-lg border p-3 text-left"
            style={{
              backgroundColor: "rgba(141, 198, 63, 0.08)",
              borderColor: "#2d6b35",
            }}
          >
            <p
              className="text-xs leading-relaxed"
              style={{ color: "#e8d5a3" }}
            >
              The email may have landed in your junk or spam folder. If so,
              please move it to your inbox before clicking the activation
              link — it may not work from the spam folder.
            </p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <a
              href="/portal"
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-colors"
              style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
            >
              Complete Your Profile
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href={FLO_LABS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold border transition-colors"
              style={{
                backgroundColor: "transparent",
                borderColor: "#2d6b35",
                color: "#e8d5a3",
              }}
            >
              <Calendar className="w-4 h-4" />
              Book Your Collection
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
