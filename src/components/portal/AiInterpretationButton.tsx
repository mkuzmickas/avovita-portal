"use client";

import { Sparkles } from "lucide-react";

/**
 * Opens the AI Lab Interpretation page for a given result in a new tab.
 * Gated behind NEXT_PUBLIC_ENABLE_AI_INTERPRETATION — renders null when
 * the flag is off so the feature is invisible in production until we
 * enable it.
 */
export function AiInterpretationButton({ resultId }: { resultId: string }) {
  if (process.env.NEXT_PUBLIC_ENABLE_AI_INTERPRETATION !== "true") {
    return null;
  }
  return (
    <a
      href={`/portal/results/interpretation/${resultId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
      style={{
        backgroundColor: "rgba(196,151,58,0.12)",
        borderColor: "#c4973a",
        color: "#c4973a",
      }}
    >
      <Sparkles className="w-3.5 h-3.5" />
      AI Interpretation
    </a>
  );
}
