"use client";

import { useState, useRef, useEffect } from "react";
import {
  Shield,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface WaiverFormProps {
  onComplete: () => void;
}

const WAIVER_TEXT = `AVOVITA WELLNESS CLIENT CONSENT, RELEASE OF LIABILITY, AND INDEMNIFICATION AGREEMENT

This agreement must be completed by the individual purchasing testing services, or by the parent or legal guardian of a minor who will be subject to specimen collection and testing. By signing below you confirm you have read, understood, and agree to all terms.

ROLE OF AVOVITA WELLNESS

AvoVita Wellness acts solely as a facilitator connecting clients with independent third-party laboratory testing and specimen collection services. AvoVita Wellness does not perform laboratory testing, does not collect or handle biological specimens, does not employ phlebotomists or laboratory technicians, and does not provide medical advice, diagnosis, or treatment. All specimen collection is performed by independent contractors and all laboratory analysis is performed by independent licensed laboratories.

RELEASE OF LIABILITY AND INDEMNIFICATION

To the fullest extent permitted by applicable law, I hereby release, waive, discharge, and covenant not to sue AvoVita Wellness, its owners, officers, employees, agents, and assigns (collectively "AvoVita") from any and all liability, claims, demands, actions, or causes of action whatsoever arising out of or related to any loss, damage, injury, or death that may be sustained by me or any person for whom I am ordering testing, including minors, arising out of or in connection with: (a) the in-home specimen collection visit, including but not limited to any adverse reaction to phlebotomy, needle injury, bruising, infection, or any other complication arising from specimen collection performed by the independent collection provider; (b) any act, omission, negligence, or conduct of the independent specimen collection provider or laboratory; (c) specimen handling, processing, shipping, or courier delays including FedEx or any other carrier; (d) laboratory testing inaccuracies, errors, or omissions; (e) any delay in or failure to deliver results.

WHERE I AM COMPLETING THIS AGREEMENT ON BEHALF OF A MINOR, I represent that I am the parent or legal guardian of the minor with full authority to execute this agreement. I agree to indemnify, defend, and hold harmless AvoVita from and against any and all claims, damages, losses, costs, and expenses (including legal fees) brought by or on behalf of the minor arising out of or related to the services facilitated by AvoVita, including any claim the minor may bring upon reaching the age of majority.

I acknowledge and agree that the home visit fee paid to AvoVita is compensation solely for facilitation and coordination services and is non-refundable once the specimen collection visit has been performed, regardless of subsequent specimen or shipping outcomes.

MEDICAL DISCLAIMER

AvoVita Wellness does not provide medical advice, diagnosis, or treatment. Laboratory results are for informational purposes only and should not be relied upon as a substitute for professional medical advice. I acknowledge that I have been advised to consult a qualified healthcare professional regarding the interpretation of any results.

DATA AND PRIVACY

By proceeding I consent to my personal and health information being transmitted to third-party laboratories, which may be located in the United States or Germany, solely for the purpose of performing the requested testing. AvoVita Wellness does not maintain permanent medical records. Results may be temporarily stored solely for the purpose of delivery via the secure patient portal and will be handled in accordance with Alberta's Personal Information Protection Act (PIPA).

GOVERNING LAW

This agreement shall be governed by the laws of the Province of Alberta. Any dispute arising hereunder shall be subject to the exclusive jurisdiction of the courts of Alberta.`;

export function WaiverForm({ onComplete }: WaiverFormProps) {
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (atBottom) setScrolledToBottom(true);
    };
    el.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const allChecked = check1 && check2 && check3;
  const nameValid = signedName.trim().length >= 3;
  const canSign = allChecked && nameValid;

  const handleSubmit = async () => {
    if (!canSign) return;
    setSubmitting(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch("/api/auth/complete-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_name: signedName.trim() }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save waiver");
      }

      onComplete();
    } catch (err) {
      const isTimeout =
        err instanceof DOMException && err.name === "AbortError";
      setError(
        isTimeout
          ? "Saving is taking longer than expected. Your waiver may have been saved — please refresh the page and try again if the next step doesn't load."
          : err instanceof Error
            ? err.message
            : "Failed to save waiver"
      );
      setSubmitting(false);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return (
    <div className="space-y-5">
      {/* Waiver heading */}
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-5 h-5 shrink-0" style={{ color: "#c4973a" }} />
        <h2
          className="font-heading text-2xl sm:text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Review and sign your <span style={{ color: "#c4973a" }}>waiver</span>
        </h2>
      </div>
      <p className="text-sm" style={{ color: "#e8d5a3" }}>
        Please read the following carefully. This waiver must be completed
        before your collection appointment.
      </p>

      {/* Scrollable waiver text */}
      <div
        ref={scrollRef}
        className="rounded-xl border p-5 max-h-[340px] overflow-y-auto text-xs leading-relaxed whitespace-pre-line"
        style={{
          backgroundColor: "#0a1a0d",
          borderColor: "#2d6b35",
          color: "#e8d5a3",
        }}
      >
        {WAIVER_TEXT}
      </div>

      {!scrolledToBottom && (
        <p
          className="text-xs italic text-center"
          style={{ color: "#c4973a" }}
        >
          ↓ Scroll down to read the full waiver before signing
        </p>
      )}

      {/* Checkboxes */}
      <div className="space-y-3">
        <CheckboxRow
          checked={check1}
          onToggle={() => setCheck1((v) => !v)}
          label="I confirm that I am 18 years of age or older, or that I am the parent or legal guardian of the individual being tested and have authority to request testing on their behalf. I confirm that the information I have provided is accurate and that I am the individual who will receive the laboratory results."
        />
        <CheckboxRow
          checked={check2}
          onToggle={() => setCheck2((v) => !v)}
          label="I confirm that I have read and understood the information above and acknowledge the role and limitations of AvoVita Wellness as a facilitator of private laboratory testing services. I agree to these terms and consent to proceed."
        />
        <CheckboxRow
          checked={check3}
          onToggle={() => setCheck3((v) => !v)}
          label="I consent to receiving laboratory results electronically via secure email through the AvoVita patient portal."
        />
      </div>

      {/* Signature field */}
      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: "#e8d5a3" }}
        >
          Type your full legal name to sign{" "}
          <span style={{ color: "#e05252" }}>*</span>
        </label>
        <input
          type="text"
          value={signedName}
          onChange={(e) => setSignedName(e.target.value)}
          placeholder="Your full name"
          className="mf-input"
          autoComplete="name"
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
        type="button"
        onClick={handleSubmit}
        disabled={!canSign || submitting}
        className="mf-btn-primary w-full py-3"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting
          ? "Saving…"
          : canSign
          ? "I Agree and Continue"
          : `${[check1, check2, check3].filter(Boolean).length}/3 acknowledged`}
      </button>

      <p className="text-xs text-center" style={{ color: "#6ab04c" }}>
        This is a one-time waiver. Once signed it applies to all future
        orders.
      </p>
    </div>
  );
}

function CheckboxRow({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-start gap-2.5 w-full text-left cursor-pointer"
      aria-pressed={checked}
    >
      <span className="mt-0.5 shrink-0">
        {checked ? (
          <CheckSquare className="w-5 h-5" style={{ color: "#c4973a" }} />
        ) : (
          <Square className="w-5 h-5" style={{ color: "#6ab04c" }} />
        )}
      </span>
      <span className="text-sm leading-relaxed" style={{ color: "#e8d5a3" }}>
        {label}
      </span>
    </button>
  );
}
