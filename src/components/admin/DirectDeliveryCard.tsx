"use client";

import { useState } from "react";
import { CheckCircle, Info, Loader2, AlertCircle } from "lucide-react";

interface DirectDeliveryCardProps {
  orderLineId: string;
  labName: string;
  patientName: string;
  onResolved: () => void;
  resolved: boolean;
}

/**
 * Variant card for order lines whose lab has results_visibility='none'.
 * No PDF upload is possible — the lab sends results directly to the referring
 * care provider. Admin clicks "Mark as Notified" to create a sentinel result
 * row so the order line drops off the pending list.
 */
export function DirectDeliveryCard({
  orderLineId,
  labName,
  patientName,
  onResolved,
  resolved,
}: DirectDeliveryCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleMark = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/mark-notified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_line_id: orderLineId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to mark as notified");
      }

      setSuccess(true);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark as notified");
      setSubmitting(false);
    }
  };

  if (success || resolved) {
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-xl border"
        style={{
          backgroundColor: "rgba(141, 198, 63, 0.125)",
          borderColor: "#8dc63f",
        }}
      >
        <CheckCircle className="w-5 h-5 shrink-0" style={{ color: "#8dc63f" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "#ffffff" }}>
            Acknowledged for {patientName}
          </p>
          <p className="text-xs" style={{ color: "#8dc63f" }}>
            Marked as delivered directly by {labName}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
    >
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#c4973a" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "#ffffff" }}>
            Results delivered directly by {labName} — no upload required
          </p>
          <p className="text-xs mt-1" style={{ color: "#e8d5a3" }}>
            This lab sends results directly to the referring care provider.
            AvoVita does not receive or relay these results. Click below to
            mark this line as acknowledged and remove it from the pending list.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 border"
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
        onClick={handleMark}
        disabled={submitting}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        style={{
          backgroundColor: "#c4973a",
          color: "#0a1a0d",
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? "Marking…" : "Mark as Notified"}
      </button>
    </div>
  );
}
