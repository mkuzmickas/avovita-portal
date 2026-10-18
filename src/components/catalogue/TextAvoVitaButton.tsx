"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MessageSquare, X } from "lucide-react";

/**
 * "Text AvoVita" opt-in button for the catalogue hero.
 *
 * Reads two env vars:
 *   NEXT_PUBLIC_SMS_ENABLED   = "true" to render the button at all
 *   NEXT_PUBLIC_SMS_NUMBER    = destination number in E.164 digits-only
 *                               form, e.g. "18552868482"
 *
 * When the user taps the button, a modal shows the exact disclosure
 * required by the Grasshopper toll-free registration (opt-in copy
 * verbatim per their trust bundle). On Confirm, the browser opens a
 * native SMS composer to that number with a prefilled message —
 * iOS and Android both honour sms: links.
 *
 * The modal is screenshot-able as the opt-in evidence Grasshopper's
 * verifier needs. Once texting is activated, flip NEXT_PUBLIC_SMS_ENABLED
 * off (or keep it on) depending on whether you want to keep the live
 * button for clients.
 */
const PRIVACY_URL = "https://avovita.ca/privacy-policy";

export function TextAvoVitaButton() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [number, setNumber] = useState<string>("");

  // Read env vars on mount (client-side; NEXT_PUBLIC_ ones are inlined
  // by Next at build time so this is safe).
  useEffect(() => {
    setEnabled(process.env.NEXT_PUBLIC_SMS_ENABLED === "true");
    setNumber(process.env.NEXT_PUBLIC_SMS_NUMBER ?? "");
  }, []);

  // Lock body scroll + Escape-to-close while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled || !number) return null;

  const smsHref = buildSmsHref(number, "Hi AvoVita — I have a question.");
  const displayNumber = formatDisplayNumber(number);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full inline-flex items-center justify-center gap-2 text-sm"
        style={{ color: "#154D31", fontWeight: 500 }}
      >
        <MessageSquare className="w-4 h-4" style={{ color: "#C6A04B" }} />
        Text AvoVita
        <ArrowRight className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="text-avovita-title"
        >
          <div
            className="w-full max-w-lg rounded-2xl border p-6 sm:p-7"
            style={{
              backgroundColor: "#FFFFFF",
              borderColor: "#E5E2D4",
              maxHeight: "calc(100dvh - 3rem)",
              overflowY: "auto",
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2
                id="text-avovita-title"
                className="font-heading text-2xl font-semibold"
                style={{
                  color: "#092819",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                Text <span style={{ color: "#C6A04B" }}>AvoVita</span>
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-1 rounded-lg"
                style={{ color: "#154D31" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grasshopper-mandated disclosure. DO NOT edit the body
             *   casually — this is the evidence string the carrier
             *   trust-bundle verifier looks for. Changing the sender
             *   number requires re-submitting the verification. */}
            <div
              className="rounded-lg p-4 mb-5 text-sm leading-relaxed"
              style={{
                backgroundColor: "#F7F6F0",
                color: "#092819",
                border: "1px solid #E5E2D4",
              }}
            >
              <p className="mb-3">
                AvoVita Wellness would like your consent to send
                informational text message communications from{" "}
                <strong>+{number}</strong> to your mobile number, in
                response to your questions or to provide information
                relevant to your relationship with us.
              </p>
              <p>
                Consent is not a condition of purchase. Message frequency
                varies. Message and data rates may apply. Reply{" "}
                <strong>STOP</strong> to unsubscribe at any time. Reply{" "}
                <strong>HELP</strong> for assistance or more information.
                We do not share your mobile opt-in information with anyone.
                See our{" "}
                <a
                  href={PRIVACY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "#C6A04B" }}
                >
                  privacy policy
                </a>{" "}
                and messaging terms and conditions for more information.
              </p>
            </div>

            <p
              className="text-xs mb-5"
              style={{ color: "#154D31" }}
            >
              Tapping <strong>Yes, open text message</strong> below opens
              a new text in your messaging app to {displayNumber}. Sending
              the message confirms your consent.
            </p>

            <div className="flex flex-col sm:flex-row-reverse gap-2">
              <a
                href={smsHref}
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold flex-1"
                style={{
                  backgroundColor: "#154D31",
                  color: "#FFFFFF",
                  fontSize: "15px",
                }}
              >
                <MessageSquare className="w-5 h-5" />
                Yes, open text message
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold border"
                style={{
                  backgroundColor: "transparent",
                  color: "#154D31",
                  borderColor: "#E5E2D4",
                  fontSize: "15px",
                }}
              >
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function buildSmsHref(digits: string, body: string): string {
  // iOS wants sms:+N?&body=…, Android/most others want sms:+N?body=…
  // Using the "?&body=" variant is the widely-recommended workaround
  // that both platforms accept. The leading + is required for
  // cross-country routing when the user is roaming or on an
  // international device.
  return `sms:+${digits}?&body=${encodeURIComponent(body)}`;
}

function formatDisplayNumber(digits: string): string {
  // E.164 11-digit NANP: 1 403 555 1234 → +1 (403) 555-1234
  const clean = digits.replace(/[^0-9]/g, "");
  if (clean.length === 11) {
    return `+${clean[0]} (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`;
  }
  return `+${clean}`;
}
