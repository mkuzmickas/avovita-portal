"use client";

import { AlertTriangle, Phone } from "lucide-react";

interface StabilityDisclaimerModalProps {
  /** Names of stability-constrained tests in this order. */
  constrainedTestNames: string[];
  /** Called when customer acknowledges — unlocks the booking iframe. */
  onAcknowledge: () => void;
}

/**
 * Pre-booking disclaimer for orders containing tests with short
 * stability windows. Forces acknowledgment before the FloLabs
 * scheduling iframe loads.
 *
 * Not dismissible via X or backdrop click — customer must click
 * "I understand" to proceed.
 */
export function StabilityDisclaimerModal({
  constrainedTestNames,
  onAcknowledge,
}: StabilityDisclaimerModalProps) {
  const testList = constrainedTestNames.join(", ");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-6"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center border"
            style={{
              backgroundColor: "rgba(217, 169, 57, 0.15)",
              borderColor: "#d4a84a",
            }}
          >
            <AlertTriangle
              className="w-5 h-5"
              style={{ color: "#d4a84a" }}
            />
          </div>
          <h2
            className="font-heading text-xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            A quick note about your booking
          </h2>
        </div>

        {/* Body */}
        <div className="space-y-3 text-sm" style={{ color: "#e8d5a3" }}>
          <p>
            Your order includes{" "}
            <strong style={{ color: "#ffffff" }}>{testList}</strong>. These
            tests have a short sample stability window.
          </p>
          <p>
            To make sure your samples arrive at the lab within their viability
            range, please select a collection appointment{" "}
            <strong style={{ color: "#c4973a" }}>
              between Saturday and Tuesday
            </strong>{" "}
            in the scheduling calendar that follows. We ship samples every
            Tuesday, and selecting a Wednesday, Thursday, or Friday collection
            may result in your samples being received past their stability
            window.
          </p>
          <p>
            If no Saturday–Tuesday slots work for your schedule, please call us
            and we&apos;ll work with you directly.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onAcknowledge}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            I understand — continue to booking
          </button>
          <a
            href="tel:+18552868482"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              backgroundColor: "transparent",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            <Phone className="w-4 h-4" />
            Call us at 1-855-AVOVITA
          </a>
        </div>
      </div>
    </div>
  );
}
