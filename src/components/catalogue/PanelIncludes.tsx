"use client";

import { useState } from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
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

  // Any panel that includes Potassium requires Tuesday-morning
  // collection so specimens ship same-day to the laboratory.
  const needsTuesday = panelTests.some((t) =>
    t.name.toLowerCase().includes("potassium"),
  );

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
          <div className="px-3 pb-3 pt-1">
            <ul
              className="space-y-1 text-xs mb-0"
              style={{ color: "#ffffff" }}
            >
              {panelTests.map((t, i) => (
                <li key={`${t.code}-${i}`} className="leading-relaxed">
                  {t.name}
                </li>
              ))}
            </ul>
            {needsTuesday && <TuesdayNotice />}
          </div>
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
      {needsTuesday && <TuesdayNotice />}
    </div>
  );
}

// ─── Tuesday collection notice ──────────────────────────────────────

function TuesdayNotice() {
  return (
    <div
      className="flex items-start gap-2 mt-3 rounded-lg border px-3 py-2 text-xs"
      style={{
        backgroundColor: "rgba(196, 151, 58, 0.08)",
        borderColor: "#c4973a",
        color: "#e8d5a3",
      }}
    >
      <AlertTriangle
        className="w-3.5 h-3.5 shrink-0 mt-0.5"
        style={{ color: "#c4973a" }}
      />
      <p>
        <strong style={{ color: "#c4973a" }}>
          Tuesday morning collection required.
        </strong>{" "}
        This panel contains Potassium, which must ship same-day to the
        laboratory. Your FloLabs appointment must be booked on a Tuesday
        morning.
      </p>
    </div>
  );
}
