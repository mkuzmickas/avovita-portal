"use client";

import { Check } from "lucide-react";

export type CheckoutStep = 1 | 2 | 3 | 4;

interface CheckoutProgressProps {
  currentStep: CheckoutStep;
  /** When true, step 2 is hidden because the cart is for "just myself". */
  skipStep2: boolean;
}

const STEPS: Array<{ step: CheckoutStep; label: string }> = [
  { step: 1, label: "People" },
  { step: 2, label: "Assign Tests" },
  { step: 3, label: "Collection" },
  { step: 4, label: "Review & Pay" },
];

export function CheckoutProgress({
  currentStep,
  skipStep2,
}: CheckoutProgressProps) {
  const visibleSteps = skipStep2
    ? STEPS.filter((s) => s.step !== 2)
    : STEPS;

  return (
    <ol className="flex items-center gap-1 sm:gap-2 mb-8 px-1 overflow-x-auto">
      {visibleSteps.map((s, idx) => {
        const completed = currentStep > s.step;
        const active = currentStep === s.step;
        const isLast = idx === visibleSteps.length - 1;

        return (
          <li key={s.step} className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold border-2 shrink-0"
                style={{
                  backgroundColor: completed || active ? "#c4973a" : "#0f2614",
                  borderColor: completed || active ? "#c4973a" : "#2d6b35",
                  color: completed || active ? "#0a1a0d" : "#6ab04c",
                }}
              >
                {completed ? <Check className="w-4 h-4" /> : idx + 1}
              </span>
              <span
                className="text-xs sm:text-sm font-medium truncate hidden sm:inline"
                style={{
                  color: active
                    ? "#ffffff"
                    : completed
                    ? "#c4973a"
                    : "#6ab04c",
                }}
              >
                {s.label}
              </span>
            </div>
            {!isLast && (
              <span
                aria-hidden
                className="h-0.5 flex-1 rounded-full"
                style={{
                  backgroundColor: completed ? "#c4973a" : "#2d6b35",
                  minWidth: 12,
                }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
