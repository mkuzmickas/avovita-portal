"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Leaf, ArrowRight } from "lucide-react";
import { ProfileForm } from "./ProfileForm";
import { ConsentModal } from "./ConsentModal";

type Step = 1 | 2 | 3;

export interface PostPurchaseOnboardingProps {
  accountId: string;
  /**
   * Names of labs present on the user's most recent order. Used by the
   * consent modal to decide which cross-border sections to show.
   */
  orderLabNames: string[];
}

export function PostPurchaseOnboarding({
  accountId,
  orderLabNames,
}: PostPurchaseOnboardingProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [profileId, setProfileId] = useState<string | null>(null);

  const handleProfileSaved = (id: string) => {
    setProfileId(id);
    setStep(2);
  };

  const handleConsentsComplete = () => {
    setStep(3);
  };

  const handleFinish = () => {
    router.push("/portal");
    router.refresh();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
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

        {/* Progress indicator */}
        <ol className="flex items-center gap-2 sm:gap-4 mb-8 px-2">
          <StepPip number={1} label="Create Profile" currentStep={step} />
          <Connector filled={step > 1} />
          <StepPip number={2} label="Sign Consent" currentStep={step} />
          <Connector filled={step > 2} />
          <StepPip number={3} label="All Set" currentStep={step} />
        </ol>

        {/* Card */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          {step === 1 && (
            <div className="px-6 sm:px-8 py-6 sm:py-8">
              <div className="mb-6">
                <h1
                  className="font-heading text-2xl sm:text-3xl font-semibold mb-2"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  Create Your <span style={{ color: "#c4973a" }}>Patient Profile</span>
                </h1>
                <p className="text-sm" style={{ color: "#e8d5a3" }}>
                  This information is required for specimen collection and
                  your lab results. All data is protected under Alberta PIPA.
                </p>
              </div>

              <ProfileForm
                accountId={accountId}
                isPrimary={true}
                onSuccess={handleProfileSaved}
              />
            </div>
          )}

          {step === 2 && profileId && (
            <div className="px-6 sm:px-8 py-8 text-center">
              <h2
                className="font-heading text-2xl font-semibold mb-3"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                Review & Sign Consent
              </h2>
              <p className="text-sm mb-4" style={{ color: "#e8d5a3" }}>
                Please review the consent sections below to continue.
              </p>

              {/* ConsentModal renders as a full-screen overlay */}
              <ConsentModal
                accountId={accountId}
                profileId={profileId}
                labNames={orderLabNames}
                onComplete={handleConsentsComplete}
              />
            </div>
          )}

          {step === 3 && (
            <div className="px-6 sm:px-8 py-10 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 border-2"
                style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
              >
                <Check className="w-9 h-9" style={{ color: "#c4973a" }} />
              </div>
              <h2
                className="font-heading text-3xl font-semibold mb-3"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                You&apos;re <span style={{ color: "#c4973a" }}>All Set</span>
              </h2>
              <p
                className="text-sm max-w-md mx-auto mb-8 leading-relaxed"
                style={{ color: "#e8d5a3" }}
              >
                Your profile and consent are on file. A FloLabs phlebotomist
                will contact you to schedule your home collection. Your
                results will appear in your portal as soon as they&apos;re
                ready.
              </p>

              <button
                type="button"
                onClick={handleFinish}
                className="mf-btn-primary px-8 py-3"
              >
                Continue to Portal
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "#6ab04c" }}
        >
          Protected by Alberta PIPA · 2490409 Alberta Ltd.
        </p>
      </div>
    </div>
  );
}

// ─── Progress indicator helpers ───────────────────────────────────────

function StepPip({
  number,
  label,
  currentStep,
}: {
  number: Step;
  label: string;
  currentStep: Step;
}) {
  const active = currentStep === number;
  const completed = currentStep > number;

  return (
    <li className="flex items-center gap-2 flex-1 min-w-0">
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0"
        style={{
          backgroundColor: completed || active ? "#c4973a" : "#0f2614",
          borderColor: completed || active ? "#c4973a" : "#2d6b35",
          color: completed || active ? "#0a1a0d" : "#6ab04c",
        }}
      >
        {completed ? <Check className="w-4 h-4" /> : number}
      </span>
      <span
        className="text-xs sm:text-sm font-medium truncate"
        style={{
          color: active ? "#ffffff" : completed ? "#c4973a" : "#6ab04c",
        }}
      >
        {label}
      </span>
    </li>
  );
}

function Connector({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden
      className="h-0.5 flex-1 rounded-full"
      style={{ backgroundColor: filled ? "#c4973a" : "#2d6b35" }}
    />
  );
}
