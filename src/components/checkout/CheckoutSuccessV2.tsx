"use client";

import { useState, useRef, useEffect } from "react";
import {
  Leaf,
  CheckCircle,
  FileText,
  Calendar,
  Loader2,
  X,
  ExternalLink,
  Shield,
  CheckSquare,
  Square,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { StabilityDisclaimerModal } from "./StabilityDisclaimerModal";

const WAIVER_TEXT = `AVOVITA WELLNESS CLIENT CONSENT, RELEASE OF LIABILITY, AND INDEMNIFICATION AGREEMENT

This agreement must be completed by the individual purchasing testing services, or by the parent or legal guardian of a minor who will be subject to specimen collection and testing. By signing below you confirm you have read, understood, and agree to all terms.

ROLE OF AVOVITA WELLNESS

AvoVita Wellness acts solely as a facilitator connecting clients with independent third-party laboratory testing and specimen collection services. AvoVita Wellness does not perform laboratory testing, does not collect or handle biological specimens, does not employ phlebotomists or laboratory technicians, and does not provide medical advice, diagnosis, or treatment. All specimen collection is performed by independent contractors and all laboratory analysis is performed by independent licensed laboratories.

RELEASE OF LIABILITY AND INDEMNIFICATION

To the fullest extent permitted by applicable law, I hereby release, waive, discharge, and covenant not to sue AvoVita Wellness, its owners, officers, employees, agents, and assigns (collectively "AvoVita") from any and all liability, claims, demands, actions, or causes of action whatsoever arising out of or related to any loss, damage, injury, or death that may be sustained by me or any person for whom I am ordering testing, including minors, arising out of or in connection with: (a) the in-home specimen collection visit, including but not limited to any adverse reaction to phlebotomy, needle injury, bruising, infection, or any other complication arising from specimen collection performed by the independent collection provider; (b) any act, omission, negligence, or conduct of the independent specimen collection provider or laboratory; (c) specimen handling, processing, shipping, or courier delays including FedEx or any other carrier; (d) laboratory testing inaccuracies, errors, or omissions; (e) any delay in or failure to deliver results.

WHERE I AM COMPLETING THIS AGREEMENT ON BEHALF OF A MINOR OR DEPENDENT, I represent that I am the parent, legal guardian, or otherwise authorized representative of that person with full authority to execute this agreement. I agree to indemnify, defend, and hold harmless AvoVita from and against any and all claims, damages, losses, costs, and expenses (including legal fees) brought by or on behalf of that person arising out of or related to the services facilitated by AvoVita.

I acknowledge and agree that the home visit fee paid to AvoVita is compensation solely for facilitation and coordination services and is non-refundable once the specimen collection visit has been performed, regardless of subsequent specimen or shipping outcomes.

MEDICAL DISCLAIMER

AvoVita Wellness does not provide medical advice, diagnosis, or treatment. Laboratory results are for informational purposes only and should not be relied upon as a substitute for professional medical advice. I acknowledge that I have been advised to consult a qualified healthcare professional regarding the interpretation of any results.

DATA AND PRIVACY

By proceeding I consent to my personal and health information being transmitted to third-party laboratories, which may be located in the United States or Germany, solely for the purpose of performing the requested testing. AvoVita Wellness does not maintain permanent medical records. Results may be temporarily stored solely for the purpose of delivery via the secure patient portal and will be handled in accordance with Alberta's Personal Information Protection Act (PIPA).

GOVERNING LAW

This agreement shall be governed by the laws of the Province of Alberta. Any dispute arising hereunder shall be subject to the exclusive jurisdiction of the courts of Alberta.`;

const REP_RELATIONSHIP_LABEL: Record<string, string> = {
  power_of_attorney: "Power of Attorney",
  parent_guardian: "Parent / Guardian",
  spouse_partner: "Spouse / Partner",
  healthcare_worker: "Healthcare Worker",
  other: "Authorized Representative",
};

export interface CheckoutSuccessV2Props {
  sessionId: string;
  email: string;
  orderIdShort: string;
  total: number;
  itemNames: string[];
  /** When true: rep flow. Show "Waiver for [Client Names]" copy. */
  isRepresentative: boolean;
  /** Dependent client names (rep flow only). */
  dependents: Array<{ first_name: string; last_name: string }>;
  /** Rep relationship key; resolved to label in UI. */
  representativeRelationship: string | null;
  /** Defaults to FloLabs Acuity URL when not provided. */
  acuityUrl: string;
  /** Pre-existing waiver state (e.g. logged-in user already signed). */
  initialWaiverDone: boolean;
  /** Optional org-specific waiver addendum (shown below the standard waiver). */
  waiverAddendum?: string | null;
  waiverAddendumTitle?: string | null;
  // ── Composition flags (added in Phase 4) ──────────────────────
  /** True if the order contained tests (defaults true for v1 compat). */
  hasTests?: boolean;
  /** True if the order contained supplements. */
  hasSupplements?: boolean;
  /** True if the order contained paid resources. */
  hasResources?: boolean;
  /** Names of stability-constrained tests in this order (if any). */
  stabilityConstrainedTests?: string[];
  /** Order ID for analytics logging. */
  orderId?: string | null;
  /** Supplement delivery method chosen at checkout. */
  supplementFulfillment?: string | null;
  /** Supplement shipping address (when fulfillment = 'shipping'). */
  supplementShippingAddress?: {
    name: string;
    street: string;
    city: string;
    province: string;
    postal: string;
    country: string;
  } | null;
}

export function CheckoutSuccessV2({
  sessionId,
  email,
  orderIdShort,
  total,
  itemNames,
  isRepresentative,
  dependents,
  representativeRelationship,
  acuityUrl,
  initialWaiverDone,
  waiverAddendum = null,
  waiverAddendumTitle = null,
  stabilityConstrainedTests = [],
  orderId = null,
  hasTests = true,
  hasSupplements = false,
  hasResources = false,
  supplementFulfillment = null,
  supplementShippingAddress = null,
}: CheckoutSuccessV2Props) {
  const [waiverDone, setWaiverDone] = useState(initialWaiverDone);
  const [showWaiver, setShowWaiver] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const hasStabilityWarning = stabilityConstrainedTests.length > 0;
  const [stabilityAcknowledged, setStabilityAcknowledged] = useState(false);

  return (
    <div
      className="min-h-screen px-4 py-8 sm:py-12"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="max-w-3xl mx-auto">
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

        {/* Confirmation hero */}
        <div
          className="rounded-2xl border px-5 sm:px-7 py-5 sm:py-6 mb-5 flex items-start gap-4"
          style={{ backgroundColor: "#1a3d22", borderColor: "#8dc63f" }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
            style={{ backgroundColor: "#0f2614", borderColor: "#8dc63f" }}
          >
            <CheckCircle className="w-6 h-6" style={{ color: "#8dc63f" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1
              className="font-heading text-2xl sm:text-3xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Payment <span style={{ color: "#c4973a" }}>received</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: "#e8d5a3" }}>
              Order{" "}
              <span className="font-mono" style={{ color: "#c4973a" }}>
                #{orderIdShort}
              </span>{" "}
              · Total{" "}
              <span style={{ color: "#c4973a", fontWeight: 600 }}>
                {formatCurrency(total)}
              </span>
            </p>
            {itemNames.length > 0 && (
              <p
                className="text-xs mt-1 truncate"
                style={{ color: "#6ab04c" }}
                title={itemNames.join(", ")}
              >
                {itemNames.join(", ")}
              </p>
            )}
          </div>
        </div>

        <p className="text-sm mb-6 text-center" style={{ color: "#e8d5a3" }}>
          Two quick steps to finish — please complete both below before your
          collection appointment.
        </p>

        {/* ── Test-specific steps (waiver + booking) — only when has_tests ── */}
        {hasTests && (<>
        {/* Step 1 — Waiver */}
        <StepCard
          number={1}
          title={
            isRepresentative && dependents.length > 0
              ? `Sign waiver for ${dependents
                  .map((d) => `${d.first_name} ${d.last_name}`)
                  .join(", ")}`
              : "Sign your waiver"
          }
          icon={FileText}
          done={waiverDone}
        >
          {waiverDone ? (
            <div className="flex items-center gap-2" style={{ color: "#8dc63f" }}>
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-semibold">Waiver Complete</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowWaiver(true)}
              className="mf-btn-primary px-5 py-2.5"
            >
              <FileText className="w-4 h-4" />
              Complete Waiver →
            </button>
          )}
        </StepCard>

        {/* Optional — set password between waiver and booking */}
        <SetPasswordCard email={email} sessionId={sessionId} />

        {/* Step 2 — Booking */}
        <StepCard
          number={2}
          title="Book your collection appointment"
          icon={Calendar}
          done={false}
        >
          {/* Stability disclaimer gate — blocks iframe until acknowledged */}
          {hasStabilityWarning && !stabilityAcknowledged && (
            <StabilityDisclaimerModal
              constrainedTestNames={stabilityConstrainedTests}
              onAcknowledge={() => {
                setStabilityAcknowledged(true);
                // Log acknowledgment to analytics
                fetch("/api/analytics/event", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    event_type: "stability_disclaimer_acknowledged",
                    event_data: {
                      order_id: orderId,
                      constrained_skus: stabilityConstrainedTests,
                    },
                  }),
                  keepalive: true,
                }).catch(() => {});
              }}
            />
          )}
          {(!hasStabilityWarning || stabilityAcknowledged) && (<>
          <p className="text-sm mb-4" style={{ color: "#e8d5a3" }}>
            Pick the date and time that works best for the in-home visit.
          </p>
          <div
            className="relative rounded-xl border overflow-hidden"
            style={{
              backgroundColor: "#0f2614",
              borderColor: "#2d6b35",
              minHeight: "700px",
            }}
          >
            {!iframeLoaded && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10"
                style={{ backgroundColor: "#0f2614" }}
              >
                <Loader2
                  className="w-6 h-6 animate-spin"
                  style={{ color: "#c4973a" }}
                />
                <p className="text-xs" style={{ color: "#e8d5a3" }}>
                  Loading scheduler…
                </p>
              </div>
            )}
            <iframe
              src={acuityUrl}
              title="Book your collection appointment"
              onLoad={() => setIframeLoaded(true)}
              className="w-full block"
              style={{
                height: "700px",
                border: "none",
                backgroundColor: "transparent",
              }}
              allow="payment"
            />
          </div>
          <p className="text-xs mt-3 text-center" style={{ color: "#6ab04c" }}>
            Trouble loading the scheduler?{" "}
            <a
              href={acuityUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#c4973a", textDecoration: "underline" }}
            >
              Open in a new tab <ExternalLink className="inline w-3 h-3" />
            </a>
          </p>
          </>)}
          {hasStabilityWarning && !stabilityAcknowledged && (
            <p className="text-sm" style={{ color: "#6ab04c" }}>
              Please review the scheduling note above to continue.
            </p>
          )}
        </StepCard>

        </>)}

        {/* ── Supplement delivery section ─────────────────────────── */}
        {hasSupplements && (
          <div
            className="rounded-2xl border overflow-hidden mt-6"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <div className="px-6 py-5">
              <h3
                className="font-heading text-lg font-semibold mb-2"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                Supplement{" "}
                <span style={{ color: "#c4973a" }}>Delivery</span>
              </h3>
              {supplementFulfillment === "shipping" ? (
                <div className="text-sm" style={{ color: "#e8d5a3" }}>
                  <p>
                    Your supplements will be shipped to{" "}
                    {supplementShippingAddress ? (
                      <span style={{ color: "#ffffff" }}>
                        {supplementShippingAddress.street},{" "}
                        {supplementShippingAddress.city},{" "}
                        {supplementShippingAddress.province}{" "}
                        {supplementShippingAddress.postal}
                      </span>
                    ) : (
                      "your shipping address"
                    )}
                    .
                  </p>
                  <p className="mt-1" style={{ color: "#6ab04c" }}>
                    Tracking will be emailed when dispatched.
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: "#e8d5a3" }}>
                  You&apos;ve indicated you&apos;ve coordinated delivery or
                  pickup with us directly. We&apos;ll be in touch if we need
                  anything further.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Resource download section ───────────────────────────── */}
        {hasResources && (
          <div
            className="rounded-2xl border overflow-hidden mt-6"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <div className="px-6 py-5">
              <h3
                className="font-heading text-lg font-semibold mb-2"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                Your{" "}
                <span style={{ color: "#c4973a" }}>Resources</span>
              </h3>
              <p className="text-sm" style={{ color: "#e8d5a3" }}>
                Your download link(s) have been emailed to{" "}
                <strong style={{ color: "#ffffff" }}>{email}</strong>.
                Please check your inbox (and junk folder). Links expire
                in 30 days.
              </p>
            </div>
          </div>
        )}

        {/* ── Resources-only: back to browse button ──────────────── */}
        {hasResources && !hasTests && !hasSupplements && (
          <div className="text-center mt-6">
            <a
              href="/resources"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
            >
              Browse More Resources
            </a>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs mt-8" style={{ color: "#6ab04c" }}>
          Questions? Contact{" "}
          <a
            href="mailto:support@avovita.ca"
            style={{ color: "#c4973a", textDecoration: "underline" }}
          >
            support@avovita.ca
          </a>
        </p>
        {hasTests && (
          <p className="text-center text-xs mt-2" style={{ color: "#6ab04c" }}>
            We&apos;ve also emailed you a portal sign-in link — use it later to
            view your results.
          </p>
        )}
        <p className="text-center text-[10px] mt-3" style={{ color: "#6ab04c" }}>
          AvoVita Wellness Inc. · GST/HST #: 735160749RT0001
        </p>
      </div>

      {showWaiver && (
        <WaiverModal
          sessionId={sessionId}
          email={email}
          isRepresentative={isRepresentative && dependents.length > 0}
          dependents={dependents}
          representativeRelationship={representativeRelationship}
          addendum={waiverAddendum}
          addendumTitle={waiverAddendumTitle}
          onClose={() => setShowWaiver(false)}
          onSigned={() => {
            setWaiverDone(true);
            // Auto-close after 2s thank-you (handled inside modal)
            setTimeout(() => setShowWaiver(false), 2000);
          }}
        />
      )}
    </div>
  );
}

function StepCard({
  number,
  title,
  icon: Icon,
  done,
  children,
}: {
  number: number;
  title: string;
  icon: typeof FileText;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border px-5 sm:px-7 py-5 sm:py-6 mb-5"
      style={{
        backgroundColor: "#1a3d22",
        borderColor: done ? "#8dc63f" : "#2d6b35",
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
          style={{
            backgroundColor: "#0f2614",
            borderColor: done ? "#8dc63f" : "#c4973a",
          }}
        >
          {done ? (
            <CheckCircle className="w-5 h-5" style={{ color: "#8dc63f" }} />
          ) : (
            <Icon className="w-5 h-5" style={{ color: "#c4973a" }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: done ? "#8dc63f" : "#c4973a" }}
          >
            Step {number}
          </p>
          <h2
            className="font-heading text-xl sm:text-2xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            {title}
          </h2>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Waiver modal ────────────────────────────────────────────────────────

function WaiverModal({
  sessionId,
  email,
  isRepresentative,
  dependents,
  representativeRelationship,
  addendum,
  addendumTitle,
  onClose,
  onSigned,
}: {
  sessionId: string;
  email: string;
  isRepresentative: boolean;
  dependents: Array<{ first_name: string; last_name: string }>;
  representativeRelationship: string | null;
  addendum: string | null;
  addendumTitle: string | null;
  onClose: () => void;
  onSigned: () => void;
}) {
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);
  const [checkAddendum, setCheckAddendum] = useState(false);
  const hasAddendum = !!addendum;
  const [signedName, setSignedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const inFlightRef = useRef(false);

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

  const clientNames = dependents
    .map((d) => `${d.first_name} ${d.last_name}`.trim())
    .join(", ");
  const relationshipLabel = representativeRelationship
    ? (REP_RELATIONSHIP_LABEL[representativeRelationship] ??
      "Authorized Representative")
    : "Authorized Representative";

  const allChecked =
    check1 && check2 && check3 && (!hasAddendum || checkAddendum);
  const nameValid = signedName.trim().length >= 3;
  const canSign = allChecked && nameValid;

  const handleSubmit = async () => {
    if (!canSign) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout/sign-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          signed_name: signedName.trim(),
          email,
          submit_intent: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save waiver");
      }
      setSigned(true);
      onSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save waiver");
      setSubmitting(false);
      inFlightRef.current = false;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)" }}
      onClick={() => !submitting && !signed && onClose()}
    >
      <div
        className="rounded-2xl border w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        onClick={(e) => e.stopPropagation()}
      >
        {signed ? (
          <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center border-2"
              style={{ backgroundColor: "#0f2614", borderColor: "#8dc63f" }}
            >
              <CheckCircle className="w-10 h-10" style={{ color: "#8dc63f" }} />
            </div>
            <h3
              className="font-heading text-2xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Waiver signed — thank you!
            </h3>
            <p className="text-sm" style={{ color: "#e8d5a3" }}>
              Returning to your booking step…
            </p>
          </div>
        ) : (
          <div className="p-5 sm:p-7 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield
                  className="w-5 h-5 shrink-0"
                  style={{ color: "#c4973a" }}
                />
                <h2
                  className="font-heading text-xl sm:text-2xl font-semibold"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  {isRepresentative ? (
                    <>
                      Waiver for{" "}
                      <span style={{ color: "#c4973a" }}>{clientNames}</span>
                    </>
                  ) : (
                    <>
                      Review and sign your{" "}
                      <span style={{ color: "#c4973a" }}>waiver</span>
                    </>
                  )}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label="Close"
                style={{ color: "#e8d5a3" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm" style={{ color: "#e8d5a3" }}>
              {isRepresentative
                ? `As ${relationshipLabel}, please read carefully and sign on behalf of your client${dependents.length !== 1 ? "s" : ""}.`
                : "Please read the following carefully before signing."}
            </p>

            {isRepresentative && (
              <div
                className="rounded-lg border p-3 text-sm"
                style={{
                  backgroundColor: "rgba(196, 151, 58, 0.08)",
                  borderColor: "#c4973a",
                  color: "#e8d5a3",
                }}
              >
                I,{" "}
                <span style={{ color: "#ffffff", fontWeight: 600 }}>
                  {signedName.trim() || "[your full name]"}
                </span>
                , am signing this waiver as{" "}
                <span style={{ color: "#c4973a", fontWeight: 600 }}>
                  {relationshipLabel}
                </span>{" "}
                with legal authority to consent on behalf of{" "}
                <span style={{ color: "#ffffff", fontWeight: 600 }}>
                  {clientNames}
                </span>
                .
              </div>
            )}

            <div
              ref={scrollRef}
              className="rounded-xl border p-4 max-h-[260px] overflow-y-auto text-xs leading-relaxed whitespace-pre-line"
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

            <div className="space-y-2">
              <CheckboxRow
                checked={check1}
                onToggle={() => setCheck1((v) => !v)}
                label={
                  isRepresentative
                    ? "I confirm I have legal authority to consent to testing on behalf of the client(s) named above. The information I have provided is accurate."
                    : "I confirm that I am 18 years of age or older, or that I am the parent or legal guardian of the individual being tested. The information I have provided is accurate."
                }
              />
              <CheckboxRow
                checked={check2}
                onToggle={() => setCheck2((v) => !v)}
                label="I confirm that I have read and understood the information above and acknowledge the role and limitations of AvoVita Wellness as a facilitator of private laboratory testing services."
              />
              <CheckboxRow
                checked={check3}
                onToggle={() => setCheck3((v) => !v)}
                label="I consent to receiving laboratory results electronically via the AvoVita client portal."
              />
            </div>

            {hasAddendum && (
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{
                  backgroundColor: "rgba(196, 151, 58, 0.08)",
                  borderColor: "#c4973a",
                }}
              >
                {addendumTitle && (
                  <h3
                    className="font-heading text-base sm:text-lg font-semibold"
                    style={{
                      color: "#c4973a",
                      fontFamily: '"Cormorant Garamond", Georgia, serif',
                    }}
                  >
                    {addendumTitle}
                  </h3>
                )}
                <p
                  className="text-xs leading-relaxed whitespace-pre-line"
                  style={{ color: "#e8d5a3" }}
                >
                  {addendum}
                </p>
                <CheckboxRow
                  checked={checkAddendum}
                  onToggle={() => setCheckAddendum((v) => !v)}
                  label="I have read and understood the referral service disclosure above."
                />
              </div>
            )}

            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "#e8d5a3" }}
              >
                {isRepresentative
                  ? "Type your (the representative's) full legal name to sign"
                  : "Type your full legal name to sign"}{" "}
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
                  ? "I Agree and Sign"
                  : (() => {
                      const ticked = [
                        check1,
                        check2,
                        check3,
                        ...(hasAddendum ? [checkAddendum] : []),
                      ].filter(Boolean).length;
                      const total = hasAddendum ? 4 : 3;
                      return `${ticked}/${total} acknowledged`;
                    })()}
            </button>
          </div>
        )}
      </div>
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

// ─── Set password card ──────────────────────────────────────────────────

function SetPasswordCard({
  email,
  sessionId,
}: {
  email: string;
  sessionId: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit =
    password.length >= 8 &&
    password === confirm &&
    !submitting &&
    !done;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/set-initial-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          email,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to set password");
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rounded-2xl border px-5 sm:px-7 py-5 sm:py-6 mb-5"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
          style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
        >
          <Shield className="w-5 h-5" style={{ color: "#c4973a" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "#c4973a" }}
          >
            Optional
          </p>
          <h2
            className="font-heading text-xl sm:text-2xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            One last thing — secure your account
          </h2>
        </div>
      </div>

      {done ? (
        <div
          className="flex items-center gap-2 p-3 rounded-lg border"
          style={{
            backgroundColor: "rgba(141, 198, 63, 0.12)",
            borderColor: "#8dc63f",
          }}
        >
          <CheckCircle
            className="w-5 h-5 shrink-0"
            style={{ color: "#8dc63f" }}
          />
          <p className="text-sm" style={{ color: "#8dc63f" }}>
            Password saved. You can now sign in at portal.avovita.ca with{" "}
            <span className="font-semibold">{email}</span>.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm mb-4" style={{ color: "#e8d5a3" }}>
            Set a password so you can sign in later without needing a magic
            link. You can skip this — we&apos;ll always email you a sign-in
            link when you need one.
          </p>
          <div className="space-y-3">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "#e8d5a3" }}
              >
                New password (8+ characters)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mf-input"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "#e8d5a3" }}
              >
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mf-input"
                autoComplete="new-password"
              />
              {confirm.length > 0 && confirm !== password && (
                <p className="text-xs mt-1" style={{ color: "#e05252" }}>
                  Passwords don&apos;t match
                </p>
              )}
            </div>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm border mt-3"
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
            disabled={!canSubmit}
            className="mf-btn-primary w-full py-3 mt-4"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Saving…" : "Set Password"}
          </button>
        </>
      )}
    </div>
  );
}
