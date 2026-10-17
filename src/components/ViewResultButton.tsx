"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { useAnalytics } from "@/lib/analytics/useAnalytics";

interface ViewResultButtonProps {
  resultId: string;
  storagePath: string;
  isNew: boolean;
}

export function ViewResultButton({ resultId, isNew }: ViewResultButtonProps) {
  const [loading, setLoading] = useState(false);
  const { trackEvent } = useAnalytics();

  const handleView = async () => {
    setLoading(true);
    trackEvent("result_viewed", { result_id: resultId });
    try {
      const response = await fetch("/api/results/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: resultId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to get result");
      }

      const { url } = await response.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to open result");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleView}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 shrink-0"
      style={
        isNew
          ? {
              backgroundColor: "#C6A04B",
              color: "#ffffff",
            }
          : {
              backgroundColor: "transparent",
              color: "#154D31",
              border: "1px solid #E5E2D4",
            }
      }
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Eye className="w-3.5 h-3.5" />
      )}
      View PDF
    </button>
  );
}
