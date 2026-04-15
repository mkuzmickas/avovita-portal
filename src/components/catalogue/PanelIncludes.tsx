"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PanelTestEntry } from "./types";

interface PanelIncludesProps {
  panelTests: PanelTestEntry[];
  /** Controls whether to render the full grid ("detail") or the
   *  collapsible "Includes X tests" summary ("card"). */
  variant: "card" | "detail";
}

/**
 * Renders the list of tests bundled inside a panel. Only the call-sites
 * that know the test IS a panel pass this in; the component trusts its
 * inputs and bails out if the list is empty.
 */
export function PanelIncludes({ panelTests, variant }: PanelIncludesProps) {
  const [open, setOpen] = useState(false);

  if (!panelTests || panelTests.length === 0) return null;

  if (variant === "card") {
    return (
      <div
        className="mb-3 rounded-lg border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold"
          style={{ color: "#c4973a" }}
          aria-expanded={open}
        >
          <span>Includes {panelTests.length} tests</span>
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform duration-200"
            style={{
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
        {open && (
          <ul
            className="px-3 pb-3 pt-1 space-y-1 text-xs"
            style={{ color: "#ffffff" }}
          >
            {panelTests.map((t, i) => (
              <li key={`${t.code}-${i}`} className="leading-relaxed">
                {t.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // variant === "detail"
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <h4
        className="font-heading text-lg font-semibold mb-3"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        What&apos;s <span style={{ color: "#c4973a" }}>Included</span>
      </h4>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {panelTests.map((t, i) => (
          <li
            key={`${t.code}-${i}`}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span style={{ color: "#ffffff" }}>{t.name}</span>
            <span
              className="text-xs font-mono shrink-0"
              style={{ color: "rgba(196, 151, 58, 0.75)" }}
            >
              {t.code}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
