"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Calendar, X, Loader2, Info, ExternalLink } from "lucide-react";
import { useAnalytics } from "@/lib/analytics/useAnalytics";

/**
 * Floating "Check availability" button + preview-only calendar modal.
 *
 * Catches hesitating shoppers before they bounce: lets them eyeball
 * FloLabs collection availability without committing to checkout.
 *
 * Under the hood: /api/availability/preview hits FloLabs' Acuity
 * public JSON endpoint server-side, aggregates 14 days into a compact
 * per-day summary, caches it, and we render the resulting grid here.
 * No iframe, no interactive booking possible from this widget.
 * (Previous versions embedded Acuity's booking iframe with
 * pointer-events:none — too clunky and hard to read.)
 *
 * Hidden on the checkout wizard (any /checkout* path — the customer sees
 * the real booking widget at the Collection step) and on /admin.
 */

const FLOLABS_FULL_URL =
  process.env.NEXT_PUBLIC_ACUITY_EMBED_URL ??
  "https://flolabsbooking.as.me/?appointmentType=84416067";

function shouldHide(pathname: string | null): boolean {
  if (!pathname) return false;
  // Checkout wizard (incl. /checkout/success and /org/[slug]/checkout)
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) return true;
  if (pathname.includes("/checkout")) return true;
  // Admin console is not customer-facing.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return false;
}

interface DaySummary {
  date: string;
  weekday: string;
  slotCount: number;
  firstTime: string | null;
  lastTime: string | null;
}

interface PreviewData {
  fetchedAt: string;
  days: DaySummary[];
  cached: boolean;
}

export function PreviewAvailabilityFab() {
  const pathname = usePathname();
  const { trackEvent } = useAnalytics();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fabRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const hidden = shouldHide(pathname);

  // Reset modal state whenever the route changes (incl. into a hidden
  // route). This keeps "each FAB click shows a fresh preview" true and
  // avoids a stale open modal reappearing when returning to a visible
  // page. Adjust-state-during-render is the React-sanctioned pattern
  // for "reset on change" — no effect needed.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/availability/preview", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          body.error ??
            "Availability preview is temporarily unavailable — you can still see full availability on the FloLabs page.",
        );
        return;
      }
      const json = (await res.json()) as PreviewData;
      setData(json);
    } catch {
      setError(
        "Couldn't reach availability preview. Try again in a moment or open the FloLabs page for the full calendar.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const openModal = useCallback(() => {
    setOpen(true);
    // Don't refetch if we already have fresh data from an earlier open
    // in the same page session — server-side is already cached 10min,
    // but sparing the round-trip is nice UX.
    if (!data) fetchAvailability();
    trackEvent("availability_preview_opened", {
      page_path:
        typeof window !== "undefined" ? window.location.pathname : pathname,
    });
  }, [trackEvent, pathname, data, fetchAvailability]);

  const closeModal = useCallback(() => {
    setOpen(false);
    // Return focus to the FAB once the modal is gone.
    requestAnimationFrame(() => fabRef.current?.focus());
  }, []);

  // Escape to close + focus trap (Tab cycles within the modal).
  useEffect(() => {
    if (!open) return;

    // Move focus into the modal on open.
    requestAnimationFrame(() => closeBtnRef.current?.focus());

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key !== "Tab") return;

      const root = modalRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, iframe, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // Lock background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closeModal]);

  if (hidden) return null;

  return (
    <>
      {/* ── Floating action button ─────────────────────────────────── */}
      <button
        ref={fabRef}
        type="button"
        onClick={openModal}
        aria-haspopup="dialog"
        aria-label="Preview collection availability"
        className="fixed z-40 inline-flex items-center gap-2 rounded-full font-semibold text-sm transition-transform hover:scale-105 active:scale-95"
        style={{
          // Sit above mobile system gesture areas via safe-area inset.
          right: "max(1rem, env(safe-area-inset-right))",
          bottom: "calc(max(1rem, env(safe-area-inset-bottom)) + 0.25rem)",
          backgroundColor: "#c4973a",
          color: "#0a1a0d",
          padding: "0.75rem 1.125rem",
          boxShadow:
            "0 4px 14px rgba(0,0,0,0.45), 0 0 0 1px rgba(106,176,76,0.25)",
        }}
      >
        <Calendar className="w-4 h-4 shrink-0" />
        <span>Preview Availability (Not a Booking)</span>
      </button>

      {/* ── Preview modal ──────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          onMouseDown={(e) => {
            // Backdrop click closes — but only when the press starts on
            // the backdrop itself, not on a drag out of the panel.
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="availability-preview-title"
            className="w-full max-w-2xl rounded-2xl border flex flex-col"
            style={{
              backgroundColor: "#1a3d22",
              borderColor: "#c4973a",
              maxHeight: "calc(100vh - 3rem)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between gap-3 p-5 border-b shrink-0"
              style={{ borderColor: "#2d6b35" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center border shrink-0"
                  style={{
                    backgroundColor: "rgba(196,151,58,0.15)",
                    borderColor: "#c4973a",
                  }}
                >
                  <Calendar className="w-5 h-5" style={{ color: "#c4973a" }} />
                </div>
                <div>
                  <h2
                    id="availability-preview-title"
                    className="font-heading text-xl font-semibold leading-tight"
                    style={{
                      color: "#ffffff",
                      fontFamily: '"Cormorant Garamond", Georgia, serif',
                    }}
                  >
                    Availability Preview
                  </h2>
                  <p
                    className="text-xs uppercase tracking-wider font-semibold mt-0.5"
                    style={{ color: "#c4973a" }}
                  >
                    Not a booking · Book after checkout
                  </p>
                </div>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={closeModal}
                aria-label="Close availability preview"
                className="p-1.5 rounded-lg transition-colors shrink-0"
                style={{ color: "#e8d5a3" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div
              ref={bodyRef}
              className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4"
              style={{ maxHeight: "calc(100vh - 12rem)" }}
            >
              {/* Loud "no booking here" banner — payment must happen
                  BEFORE the appointment can be booked. Prominent solid
                  amber so a hesitating shopper reads it before scrolling
                  the calendar. */}
              <div
                className="rounded-xl border-2 p-4 sm:p-5"
                style={{
                  backgroundColor: "#c4973a",
                  borderColor: "#0a1a0d",
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="shrink-0"
                    style={{
                      color: "#0a1a0d",
                      fontSize: "28px",
                      lineHeight: 1,
                      fontWeight: 700,
                    }}
                  >
                    ⚠
                  </span>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p
                      className="uppercase tracking-widest font-bold text-xs"
                      style={{ color: "#0a1a0d" }}
                    >
                      This View Is Preview Only — You Cannot Book Here
                    </p>
                    <p
                      className="text-sm leading-snug font-semibold"
                      style={{ color: "#0a1a0d" }}
                    >
                      Your collection appointment is booked{" "}
                      <span style={{ textDecoration: "underline" }}>
                        after
                      </span>{" "}
                      you complete checkout, so the appointment is linked
                      to your paid tests. We work this way because a
                      booked appointment with no paid tests attached
                      leaves us with an orphaned slot that no phlebotomist
                      can fulfill — everyone loses the time.
                    </p>
                    <p className="text-xs" style={{ color: "#0a1a0d" }}>
                      Use this view to gauge how busy the next two weeks
                      look. Real booking happens on the confirmation page
                      right after payment.
                    </p>
                  </div>
                </div>
              </div>

              {/* Secondary note — stability-window / fasting nuance. */}
              <div
                className="flex gap-3 rounded-lg border p-3"
                style={{
                  backgroundColor: "rgba(217,169,57,0.10)",
                  borderColor: "#d4a84a",
                }}
              >
                <Info
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: "#d4a84a" }}
                />
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "#e8d5a3" }}
                >
                  Tests with short stability windows (CBC, Basic Metabolic
                  Panel, potassium panels, etc.) are Tuesday-only; other
                  tests may have fasting or timing requirements confirmed
                  at checkout.
                </p>
              </div>

              {/* Calendar body */}
              {loading && !data && (
                <div className="flex flex-col items-center gap-2 py-12">
                  <Loader2
                    className="w-6 h-6 animate-spin"
                    style={{ color: "#c4973a" }}
                  />
                  <p className="text-xs" style={{ color: "#e8d5a3" }}>
                    Loading availability…
                  </p>
                </div>
              )}
              {error && !loading && (
                <div
                  className="rounded-lg border p-4 space-y-3"
                  style={{
                    backgroundColor: "rgba(224,82,82,0.10)",
                    borderColor: "#e05252",
                  }}
                >
                  <p className="text-sm" style={{ color: "#e8d5a3" }}>
                    {error}
                  </p>
                  <a
                    href={FLOLABS_FULL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: "#c4973a" }}
                  >
                    Open FloLabs booking page
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
              {data && data.days.length > 0 && (
                <>
                  {/* Legend — green = available, amber = limited slots
                      running out, muted gray = nothing left. Fully-booked
                      cells are deliberately dulled so a wall of empty
                      days doesn't visually read as "everything's fine". */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <LegendSwatch color="#8dc63f" label="Available" />
                    <LegendSwatch color="#d4a84a" label="Almost full" />
                    <LegendSwatch color="#3a4550" label="Fully booked" />
                  </div>

                  {/* 2-week grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                    {data.days.map((day) => (
                      <DayCell key={day.date} day={day} />
                    ))}
                  </div>

                  {/* Timestamp + refresh */}
                  <div
                    className="flex items-center justify-between text-xs pt-2 border-t"
                    style={{ borderColor: "#2d6b35", color: "#6ab04c" }}
                  >
                    <span>
                      Snapshot from FloLabs · updated{" "}
                      {new Date(data.fetchedAt).toLocaleTimeString("en-CA", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={fetchAvailability}
                      disabled={loading}
                      className="underline disabled:opacity-50"
                      style={{ color: "#c4973a" }}
                    >
                      {loading ? "Refreshing…" : "Refresh"}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div
              className="p-5 border-t shrink-0 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"
              style={{ borderColor: "#2d6b35" }}
            >
              <a
                href={FLOLABS_FULL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: "#c4973a" }}
              >
                Open FloLabs booking page
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ color: "#e8d5a3" }}
    >
      <span
        aria-hidden="true"
        className="inline-block w-3 h-3 rounded-sm border"
        style={{ backgroundColor: color, borderColor: color }}
      />
      {label}
    </span>
  );
}

function DayCell({ day }: { day: DaySummary }) {
  // Bucket by slot count. Numbers tuned to FloLabs' typical daily
  // capacity — if their scheduling changes materially the thresholds
  // may need re-tuning. Green = plenty, amber = running out, muted
  // gray = nothing.
  //
  // Fully-booked cells are deliberately DULL: neutral border, muted
  // text, low-contrast background. Previously they used the brand
  // green border (#2d6b35) which made "no slots" look positive next
  // to the amber "limited" cells that ARE available — a wall of empty
  // days visually read as "everything's fine".
  const bucket: "good" | "limited" | "none" =
    day.slotCount >= 6 ? "good" : day.slotCount > 0 ? "limited" : "none";

  const palette = {
    good: {
      bg: "rgba(141,198,63,0.14)",
      border: "#8dc63f",
      accent: "#8dc63f",
      dateColor: "#ffffff",
      countColor: "#8dc63f",
      rangeColor: "#e8d5a3",
    },
    limited: {
      bg: "rgba(217,169,57,0.14)",
      border: "#d4a84a",
      accent: "#d4a84a",
      dateColor: "#ffffff",
      countColor: "#d4a84a",
      rangeColor: "#e8d5a3",
    },
    none: {
      bg: "rgba(255,255,255,0.02)",
      border: "#3a4550",
      accent: "#6b7280",
      dateColor: "#6b7280",
      countColor: "#6b7280",
      rangeColor: "#6b7280",
    },
  }[bucket];

  // "Aug 11" style. Constructed via UTC noon so the tz offset can't
  // flip the label onto the wrong day.
  const [y, m, d] = day.date.split("-").map(Number);
  const dayLabel = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));

  const rangeLabel =
    day.firstTime && day.lastTime
      ? day.firstTime === day.lastTime
        ? day.firstTime
        : `${day.firstTime} – ${day.lastTime}`
      : null;

  const countLabel =
    day.slotCount === 0
      ? "Fully booked"
      : day.slotCount === 1
        ? "1 slot"
        : `${day.slotCount} slots`;

  return (
    <div
      className="rounded-lg border p-2.5 flex flex-col gap-1"
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
    >
      <p
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: palette.accent }}
      >
        {day.weekday}
      </p>
      <p
        className="text-sm font-semibold leading-tight"
        style={{ color: palette.dateColor }}
      >
        {dayLabel}
      </p>
      <p
        className="text-xs font-semibold"
        style={{ color: palette.countColor }}
      >
        {countLabel}
      </p>
      {rangeLabel && (
        <p className="text-[10px]" style={{ color: palette.rangeColor }}>
          {rangeLabel}
        </p>
      )}
    </div>
  );
}
