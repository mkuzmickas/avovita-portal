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

const WAIVER_TEXT = `AVOVITA WELLNESS CLIENT CONSENT AND SERVICE ACKNOWLEDGEMENT

This form is to be completed by the individual who has ordered the testing, or the parent/legal guardian of the minor who will be having the blood draw completed on them.

ROLE OF AVOVITA WELLNESS

AvoVita Wellness acts as a facilitator of private laboratory testing services. We assist clients in arranging laboratory testing with independent third-party laboratories and specimen collection providers. AvoVita Wellness does not perform laboratory testing and does not collect blood or other biological specimens. All testing services are performed by licensed laboratories, and specimen collection is performed by independent third-party collection providers. By purchasing our services you acknowledge that AvoVita Wellness does not control or supervise these laboratories or collection providers and acts only as an intermediary facilitating access to private testing services.

LIABILITY AND THIRD-PARTY SERVICES

I understand that laboratory testing, specimen collection, and specimen transportation are performed by independent third-party providers. I acknowledge that AvoVita Wellness is not responsible for incidents, delays, or outcomes related to these services including but not limited to: blood draw or phlebotomy complications, specimen handling or laboratory processing issues, laboratory testing inaccuracies or reporting errors, specimen shipping or courier delays including FedEx or other carriers. Any consent for or notice of adverse reactions to specimen collection will be provided directly by the collection provider.

MEDICAL DISCLAIMER AND DATA HANDLING

AvoVita Wellness does not provide medical advice, diagnosis, or treatment. Any information provided regarding laboratory testing is for general informational purposes only and should not be considered medical guidance. Laboratory test results are generated and maintained by the performing laboratory within their laboratory information systems. AvoVita Wellness does not maintain permanent medical records. Results may be temporarily downloaded solely for the purpose of delivering them to the client via secure email and will be deleted from AvoVita systems upon delivery. By purchasing testing services you acknowledge that as a facilitator of private laboratory testing, associated information may be transmitted to partner laboratories located in the United States and Germany for processing.`;

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

    try {
      const res = await fetch("/api/auth/complete-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_name: signedName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ?? "Failed to save waiver"
        );
      }

      onComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save waiver"
      );
      setSubmitting(false);
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
