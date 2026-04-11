"use client";

import { Check } from "lucide-react";
import type { OrderStatus } from "@/types/database";

const TIMELINE: Array<{ key: OrderStatus; label: string }> = [
  { key: "confirmed", label: "Ordered" },
  { key: "confirmed", label: "Confirmed" },
  { key: "collected", label: "Collected" },
  { key: "shipped", label: "Shipped" },
  { key: "resulted", label: "Resulted" },
  { key: "complete", label: "Complete" },
];

// Ordered list of states that map to timeline progression. Duplicates
// of "confirmed" for Ordered + Confirmed are handled via index lookup.
const STATUS_ORDER: OrderStatus[] = [
  "pending",
  "confirmed",
  "collected",
  "shipped",
  "resulted",
  "complete",
];

export interface OrderTimelineProps {
  status: OrderStatus;
}

/**
 * Horizontal stepper showing the order's progression through collection,
 * lab, and results stages. Current step highlighted in gold, completed
 * steps filled with a checkmark.
 */
export function OrderTimeline({ status }: OrderTimelineProps) {
  const currentIdx = STATUS_ORDER.indexOf(status);
  const isCancelled = status === "cancelled";

  // Compute the index of each timeline step relative to STATUS_ORDER.
  // Ordered = 1 (confirmed), Confirmed = 1, etc. They share the same
  // underlying state but the label distinction is useful to patients.
  const stepIndices = [1, 1, 2, 3, 4, 5];

  if (isCancelled) {
    return (
      <div
        className="rounded-lg border px-4 py-3 text-sm"
        style={{
          backgroundColor: "rgba(224, 82, 82, 0.08)",
          borderColor: "#e05252",
          color: "#e05252",
        }}
      >
        This order was cancelled.
      </div>
    );
  }

  return (
    <ol className="flex items-start gap-1 sm:gap-2 overflow-x-auto pb-1">
      {TIMELINE.map((step, idx) => {
        const stepIdx = stepIndices[idx];
        const completed = currentIdx > stepIdx;
        const current = currentIdx === stepIdx && idx === TIMELINE.findIndex((s) => STATUS_ORDER.indexOf(s.key) === currentIdx);
        const active = current || completed;

        // Special-case: when status=confirmed, only highlight "Confirmed" (idx 1), not "Ordered"
        const isCurrentStep =
          (idx === 0 && currentIdx >= 1) ||
          (idx > 0 && STATUS_ORDER.indexOf(TIMELINE[idx].key) === currentIdx);

        return (
          <li
            key={idx}
            className="flex flex-col items-center min-w-[60px] sm:min-w-[80px] flex-1"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2"
              style={{
                backgroundColor: active ? "#c4973a" : "#0f2614",
                borderColor: isCurrentStep || active ? "#c4973a" : "#2d6b35",
                color: active ? "#0a1a0d" : "#6ab04c",
              }}
            >
              {completed ? <Check className="w-3.5 h-3.5" /> : idx + 1}
            </div>
            <span
              className="mt-1 text-[10px] sm:text-xs text-center leading-tight"
              style={{
                color: isCurrentStep
                  ? "#c4973a"
                  : active
                  ? "#e8d5a3"
                  : "#6ab04c",
                fontWeight: isCurrentStep ? 600 : 400,
              }}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
