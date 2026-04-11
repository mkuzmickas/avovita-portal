"use client";

import { useState } from "react";
import { Shield, X, CheckSquare, Square, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ConsentType } from "@/types/database";

const CONSENT_TEXT: Record<ConsentType, { title: string; version: string; body: string }> = {
  general_pipa: {
    title: "General Privacy Consent (Alberta PIPA)",
    version: "1.0-2025",
    body: `AvoVita Wellness (2490409 Alberta Ltd.) collects, uses, and discloses your personal health information in accordance with the Personal Information Protection Act (Alberta) ("PIPA").

Your information is collected solely for the purposes of facilitating private laboratory testing services, including:
• Scheduling and coordinating specimen collection by FloLabs phlebotomists
• Shipping specimens to partner laboratories
• Receiving, storing, and delivering your lab results securely

Your health data is stored on servers located in Canada (Supabase Canada Central). It is never sold or disclosed to third parties for marketing purposes.

You may withdraw consent at any time by contacting hello@avovita.ca. Withdrawal does not affect the lawfulness of processing prior to withdrawal.

This consent covers the handling of your name, date of birth, biological sex, address, phone number, and any health information contained in your lab results.`,
  },
  cross_border_us: {
    title: "Cross-Border Transfer Consent — United States",
    version: "1.0-2025",
    body: `One or more tests you have selected are processed by a laboratory located in the United States (US).

By consenting, you authorize AvoVita Wellness to:
• Ship your biological specimen(s) across the Canada-US border
• Share your identifying information (name, date of birth, biological sex, test order details) with the US laboratory solely for the purpose of processing your specimen and returning results

Please be aware:
• US laboratories are subject to US health privacy laws (including HIPAA) which differ from Alberta PIPA
• Your specimen and associated data will be handled under US jurisdiction during processing
• AvoVita enters into data processing agreements with all partner labs to protect your information

This consent is specific to the test(s) you are currently ordering that are processed by US-based labs (Mayo Clinic Laboratories and/or ReligenDx). This consent may be withdrawn for future orders by contacting hello@avovita.ca.`,
  },
  cross_border_de: {
    title: "Cross-Border Transfer Consent — Germany / European Union",
    version: "1.0-2025",
    body: `One or more tests you have selected are processed by a laboratory located in Germany, within the European Union (EU).

By consenting, you authorize AvoVita Wellness to:
• Ship your biological specimen(s) internationally to Germany
• Share your identifying information (name, date of birth, biological sex, test order details) with the EU laboratory solely for the purpose of processing your specimen and returning results

Please be aware:
• EU laboratories operate under the General Data Protection Regulation (GDPR), which provides strong privacy protections
• Your specimen and associated data will be handled under GDPR jurisdiction during processing
• AvoVita enters into Standard Contractual Clauses (SCCs) and data processing agreements with all EU partner labs

This consent is specific to the test(s) you are currently ordering that are processed by Armin Labs (Germany). This consent may be withdrawn for future orders by contacting hello@avovita.ca.`,
  },
  cross_border_ca: {
    title: "Cross-Border Transfer Consent — Canada (Inter-Provincial)",
    version: "1.0-2025",
    body: `One or more tests you have selected are processed by a laboratory in another Canadian province.

By consenting, you authorize AvoVita Wellness to transfer your specimen and associated health information to the processing laboratory. Your information remains within Canada and is subject to applicable Canadian privacy legislation.`,
  },
  collection_authorization: {
    title: "Specimen Collection Authorization",
    version: "1.0-2025",
    body: `You authorize FloLabs (a licensed third-party phlebotomy service) to visit your provided address to collect biological specimens (blood, urine, or other as required by your ordered tests).

This authorization covers:
• Entry to your specified address at the agreed appointment time
• Collection of specimens from yourself and/or any additional profiles included on this order
• Handling and transport of specimens to AvoVita for onward shipping to the processing laboratory

You may reschedule or cancel your collection appointment by contacting AvoVita at hello@avovita.ca at least 24 hours in advance.`,
  },
};

interface ConsentModalProps {
  consentTypes: ConsentType[];
  labName: string;
  onConsented: () => void;
  onDismissed: () => void;
  profileId?: string;
}

export function ConsentModal({
  consentTypes,
  onConsented,
  onDismissed,
  profileId,
}: ConsentModalProps) {
  const [checkedConsents, setCheckedConsents] = useState<Set<ConsentType>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = consentTypes.every((ct) => checkedConsents.has(ct));

  const toggleConsent = (ct: ConsentType) => {
    setCheckedConsents((prev) => {
      const next = new Set(prev);
      if (next.has(ct)) {
        next.delete(ct);
      } else {
        next.add(ct);
      }
      return next;
    });
  };

  const handleConsent = async () => {
    if (!allChecked) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to provide consent.");
      setLoading(false);
      return;
    }

    let ipAddress: string | null = null;
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipRes.json();
      ipAddress = ipData.ip ?? null;
    } catch {
      // best-effort
    }

    const userAgent = navigator.userAgent;

    const consentsToInsert = consentTypes.map((ct) => ({
      account_id: user.id,
      profile_id: profileId ?? null,
      consent_type: ct,
      consent_text_version: CONSENT_TEXT[ct].version,
      ip_address: ipAddress,
      user_agent: userAgent,
    }));

    const { error: insertError } = await supabase
      .from("consents")
      .insert(consentsToInsert);

    if (insertError) {
      setError(`Failed to record consent: ${insertError.message}`);
      setLoading(false);
      return;
    }

    setLoading(false);
    onConsented();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)" }}
    >
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center gap-3 border-b rounded-t-2xl"
          style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
        >
          <Shield className="w-5 h-5 shrink-0" style={{ color: "#c4973a" }} />
          <div className="flex-1">
            <h2
              className="font-heading text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Privacy & Consent Required
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#e8d5a3" }}>
              Alberta PIPA requires your explicit consent before we process your
              health information.
            </p>
          </div>
          <button
            onClick={onDismissed}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "#6ab04c" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Consent content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {consentTypes.map((ct) => {
            const consent = CONSENT_TEXT[ct];
            const checked = checkedConsents.has(ct);

            return (
              <div key={ct} className="space-y-3">
                <h3
                  className="font-semibold text-sm"
                  style={{ color: "#ffffff" }}
                >
                  {consent.title}
                </h3>

                <div
                  className="rounded-xl p-4 max-h-48 overflow-y-auto border"
                  style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
                >
                  <p
                    className="text-xs whitespace-pre-line leading-relaxed"
                    style={{ color: "#e8d5a3" }}
                  >
                    {consent.body}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleConsent(ct)}
                  className="flex items-start gap-2.5 w-full text-left group"
                >
                  <div className="mt-0.5 shrink-0">
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
                  </div>
                  <span className="text-sm" style={{ color: "#e8d5a3" }}>
                    I have read and understand the above. I provide my explicit,
                    informed consent as described.
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t space-y-3"
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

          <div className="flex gap-3">
            <button
              onClick={onDismissed}
              className="mf-btn-secondary flex-1 py-2.5"
            >
              Cancel
            </button>
            <button
              onClick={handleConsent}
              disabled={!allChecked || loading}
              className="mf-btn-primary flex-1 py-2.5"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {allChecked
                ? "Confirm & Continue"
                : `${checkedConsents.size}/${consentTypes.length} confirmed`}
            </button>
          </div>

          <p className="text-center text-xs" style={{ color: "#6ab04c" }}>
            Consent records are retained permanently per Alberta PIPA requirements.
          </p>
        </div>
      </div>
    </div>
  );
}
