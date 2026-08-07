"use client";

import { X, Sparkles, ArrowRight } from "lucide-react";

interface AskPromptLauncherProps {
  /** Name of the test the customer just added — surfaced in an
   *  attentive acknowledgment ("You've added X") rather than used to
   *  infer what they need next. Falls back to generic phrasing when
   *  the name isn't known. */
  testName: string | null;
  /** Catalogue size — surfaced in the offer copy ("I can search all
   *  445 tests") because "anything else?" alone reads shop-assistant
   *  and gets a reflex no-thanks. Naming the depth of the catalogue
   *  tells the customer something they don't know, which is a better
   *  reason to engage than a suggestion they didn't ask for. */
  totalTestCount: number;
  onAccept: () => void;
  onDismiss: () => void;
}

/**
 * Post-add nudge: fixed bottom-right, above the CartBar, dismissible.
 * Not a modal — no overlay, no focus trap, no scroll lock. Customer
 * must be able to ignore it and continue to Checkout without any
 * blockage. On mobile it collapses to a compact one-liner because the
 * full card is too much of the viewport at that width.
 *
 * Copy design:
 *   1. Acknowledge the test they added by name (attentive, not
 *      automated) — do NOT infer what they need next.
 *   2. Fee sentence — the visit fee is the most likely cause of the
 *      81% checkout drop-off and is now sunk cost. Any further test
 *      added to this appointment costs only the test price. This is
 *      the highest-value sentence in the funnel and it's said
 *      nowhere else.
 *   3. Open-ended offer that names the catalogue depth ("all N
 *      tests") — better reason to engage than a "what pairs with?"
 *      suggestion, which implies clinical recommendation and crosses
 *      the no-diagnosis line, or a bare "anything else?" which reads
 *      shop-assistant and gets a reflex no-thanks.
 */
export function AskPromptLauncher({
  testName,
  totalTestCount,
  onAccept,
  onDismiss,
}: AskPromptLauncherProps) {
  const namedTest = testName ?? "your test";

  return (
    <div
      className="fixed z-40 bottom-[110px] right-3 sm:right-6 sm:bottom-[130px] max-w-[calc(100vw-24px)] sm:max-w-sm rounded-2xl border shadow-lg"
      style={{
        backgroundColor: "#1a3d22",
        borderColor: "#c4973a",
        boxShadow: "0 10px 30px -8px rgba(0,0,0,0.55)",
      }}
      role="dialog"
      aria-label="Ask AvoVita suggestion"
    >
      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-start gap-2 mb-2">
          <div
            className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5"
            style={{
              backgroundColor: "#0f2614",
              border: "1px solid #c4973a",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: "#c4973a" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#c4973a", letterSpacing: "0.1em" }}
            >
              Ask AvoVita
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss suggestion"
            className="p-0.5 rounded-md shrink-0"
            style={{ color: "#e8d5a3" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Full copy — desktop / larger phones */}
        {testName && (
          <p
            className="hidden sm:block text-sm mb-2"
            style={{ color: "#e8d5a3" }}
          >
            You&apos;ve added{" "}
            <span style={{ color: "#ffffff", fontWeight: 600 }}>{namedTest}</span>.
          </p>
        )}
        <p
          className="hidden sm:block text-sm leading-relaxed mb-3"
          style={{ color: "#ffffff" }}
        >
          Your <strong style={{ color: "#c4973a" }}>$85 visit fee</strong> is
          now covered. Any test added to this same appointment costs only the
          test price — the visit is not charged twice.
        </p>
        <p
          className="hidden sm:block text-sm mb-3"
          style={{ color: "#e8d5a3" }}
        >
          Looking for anything else? I can search all {totalTestCount} tests.
        </p>

        {/* Compact copy — mobile */}
        <p
          className="sm:hidden text-xs leading-relaxed mb-3"
          style={{ color: "#ffffff" }}
        >
          <strong style={{ color: "#c4973a" }}>Visit fee covered.</strong>{" "}
          Any test added to this appointment is just the test price. I can
          search all {totalTestCount} tests.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            Yes, help me look
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border"
            style={{
              backgroundColor: "transparent",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
