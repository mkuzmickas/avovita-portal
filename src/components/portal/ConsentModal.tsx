"use client";

import { useState, useMemo } from "react";
import { Shield, CheckSquare, Square, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ConsentType } from "@/types/database";

export interface ConsentModalProps {
  /** Account id — attached to every consent row. */
  accountId: string;
  /** Optional profile id to attach to every consent row. */
  profileId?: string;
  /**
   * Labs present on the current order. Used to decide which cross-border
   * consent sections to show. Pass an empty array for the first-profile
   * case where only the general PIPA consent is required.
   */
  labNames: string[];
  /** Called after every required consent row has been inserted. */
  onComplete: () => void;
}

interface ConsentSection {
  type: ConsentType;
  title: string;
  body: string;
  version: string;
}

const GENERAL_PIPA: ConsentSection = {
  type: "general_pipa",
  title: "General PIPA Consent",
  version: "1.0",
  body: `I consent to AvoVita Wellness (2490409 Alberta Ltd) collecting, using, and storing my personal health information for the purpose of facilitating private laboratory testing services, in accordance with Alberta's Personal Information Protection Act (PIPA). I understand my information will be retained for a minimum of 10 years as required by health records legislation.`,
};

const US_CROSS_BORDER: ConsentSection = {
  type: "cross_border_us",
  title: "Cross-Border Transfer Consent — United States",
  version: "1.0",
  body: `I understand and consent that my personal health information including name, date of birth, and biological sex will be transmitted to laboratory facilities located in the United States for the purpose of test processing. I acknowledge that US privacy laws including the CLOUD Act may apply to my data once it crosses the Canadian border. I have been informed of this cross-border transfer and consent to it.`,
};

const DE_CROSS_BORDER: ConsentSection = {
  type: "cross_border_de",
  title: "Cross-Border Transfer Consent — Germany",
  version: "1.0",
  body: `I understand and consent that my personal health information will be transmitted to Armin Labs located in Germany for the purpose of test processing under GDPR data protection standards.`,
};

/** Labs that trigger the US cross-border consent section. */
const US_LABS = new Set([
  "Mayo Clinic Laboratories",
  "ReligenDx",
  "Precision Epigenomics",
]);

/** Labs that trigger the Germany cross-border consent section. */
const DE_LABS = new Set(["Armin Labs"]);

/**
 * Full-screen, non-dismissible consent modal shown during the post-purchase
 * onboarding flow and whenever a new profile is created. The required
 * sections are computed from the `labNames` prop: general PIPA is always
 * shown; US consent is added if any lab in the order is a US-based partner;
 * German consent is added if Armin Labs is present.
 */
export function ConsentModal({
  accountId,
  profileId,
  labNames,
  onComplete,
}: ConsentModalProps) {
  const requiredSections = useMemo<ConsentSection[]>(() => {
    const sections: ConsentSection[] = [GENERAL_PIPA];

    const hasUsLab = labNames.some((n) => US_LABS.has(n));
    const hasDeLab = labNames.some((n) => DE_LABS.has(n));

    if (hasUsLab) sections.push(US_CROSS_BORDER);
    if (hasDeLab) sections.push(DE_CROSS_BORDER);

    return sections;
  }, [labNames]);

  const [checkedSections, setCheckedSections] = useState<Set<ConsentType>>(
    new Set()
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = requiredSections.every((s) => checkedSections.has(s.type));

  const toggle = (type: ConsentType) => {
    setCheckedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!allChecked) return;

    setSubmitting(true);
    setError(null);

    const supabase = createClient();

    // Best-effort IP + UA capture for audit log
    let ipAddress: string | null = null;
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipRes.json();
      ipAddress = ipData.ip ?? null;
    } catch {
      // Non-fatal — consent is still valid without IP
    }
    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : null;

    const rows = requiredSections.map((s) => ({
      account_id: accountId,
      profile_id: profileId ?? null,
      consent_type: s.type,
      consent_text_version: s.version,
      ip_address: ipAddress,
      user_agent: userAgent,
    }));

    const { error: insertErr } = await supabase.from("consents").insert(rows);

    if (insertErr) {
      setError(`Failed to record consent: ${insertErr.message}`);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onComplete();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: "rgba(10, 26, 13, 0.92)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
    >
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border shadow-2xl"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
      >
        {/* Header (no close button — non-dismissible) */}
        <div
          className="px-5 sm:px-6 py-4 flex items-center gap-3 border-b rounded-t-2xl"
          style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
        >
          <Shield className="w-5 h-5 shrink-0" style={{ color: "#c4973a" }} />
          <div className="flex-1 min-w-0">
            <h2
              id="consent-modal-title"
              className="font-heading text-lg sm:text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Privacy & Consent Required
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#e8d5a3" }}>
              Alberta PIPA requires your explicit consent before we process
              your health information.
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {requiredSections.map((section) => {
            const checked = checkedSections.has(section.type);
            return (
              <section key={section.type} className="space-y-3">
                <h3
                  className="font-semibold text-sm"
                  style={{ color: "#ffffff" }}
                >
                  {section.title}
                </h3>

                <div
                  className="rounded-xl p-4 border text-xs leading-relaxed"
                  style={{
                    backgroundColor: "#0f2614",
                    borderColor: "#2d6b35",
                    color: "#e8d5a3",
                  }}
                >
                  {section.body}
                </div>

                <button
                  type="button"
                  onClick={() => toggle(section.type)}
                  className="flex items-start gap-2.5 w-full text-left cursor-pointer"
                  aria-pressed={checked}
                >
                  <span className="mt-0.5 shrink-0">
                    {checked ? (
                      <CheckSquare
                        className="w-5 h-5"
                        style={{ color: "#c4973a" }}
                      />
                    ) : (
                      <Square
                        className="w-5 h-5"
                        style={{ color: "#6ab04c" }}
                      />
                    )}
                  </span>
                  <span className="text-sm" style={{ color: "#e8d5a3" }}>
                    I have read and understand the above. I provide my
                    explicit, informed consent as described.
                  </span>
                </button>
              </section>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="px-5 sm:px-6 py-4 border-t space-y-3"
          style={{ borderColor: "#2d6b35" }}
        >
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
            onClick={handleConfirm}
            disabled={!allChecked || submitting}
            className="mf-btn-primary w-full py-3"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {allChecked
              ? "Confirm and Continue"
              : `${checkedSections.size} / ${requiredSections.length} acknowledged`}
          </button>

          <p className="text-center text-xs" style={{ color: "#6ab04c" }}>
            Consent records are retained permanently per Alberta PIPA
            requirements.
          </p>
        </div>
      </div>
    </div>
  );
}
