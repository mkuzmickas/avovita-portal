"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Calendar, X, Loader2, Info } from "lucide-react";
import { useAnalytics } from "@/lib/analytics/useAnalytics";

/**
 * Floating "Check availability" button + preview-only Acuity modal.
 *
 * Catches hesitating shoppers before they bounce: lets them eyeball the
 * FloLabs collection calendar without committing to checkout. The iframe
 * is the real Acuity widget (Acuity has no native read-only mode) — the
 * amber notice makes the preview-only nature explicit, and any booking
 * made here is operationally orphaned (no order, no payment, no FloLabs
 * notification) so it triggers nothing. See PR notes re: future
 * Acuity-API availability rendering if orphaned-booking spam appears.
 *
 * Hidden on the checkout wizard (any /checkout* path — the customer sees
 * the real widget at the Collection step) and on /admin.
 */

const ACUITY_EMBED_URL =
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

export function PreviewAvailabilityFab() {
  const pathname = usePathname();
  const { trackEvent } = useAnalytics();
  const [open, setOpen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const fabRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

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

  const openModal = useCallback(() => {
    setIframeLoaded(false);
    setOpen(true);
    trackEvent("availability_preview_opened", {
      page_path:
        typeof window !== "undefined" ? window.location.pathname : pathname,
    });
  }, [trackEvent, pathname]);

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
        <span>Check availability</span>
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
                <h2
                  id="availability-preview-title"
                  className="font-heading text-xl font-semibold"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  Collection Availability
                </h2>
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
            <div className="overflow-y-auto p-5 space-y-4">
              {/* Amber preview-only notice */}
              <div
                className="flex gap-3 rounded-lg border p-4"
                style={{
                  backgroundColor: "rgba(217,169,57,0.12)",
                  borderColor: "#d4a84a",
                }}
              >
                <Info
                  className="w-5 h-5 shrink-0 mt-0.5"
                  style={{ color: "#d4a84a" }}
                />
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "#e8d5a3" }}
                >
                  This is a preview only. Your actual appointment will be
                  booked during checkout after you complete your order. If
                  your cart includes any tests with short stability windows
                  (such as Complete Blood Count, Direct Antiglobulin Test,
                  Basic Metabolic Panel, or other panels containing
                  potassium), booking will be restricted to a Tuesday morning
                  collection. Some tests with longer stability allow Saturday
                  to Tuesday only. Tests requiring fasting or specific timing
                  may also have additional booking constraints — these will be
                  confirmed at checkout.
                </p>
              </div>

              {/* Restating banner — sits flush above the iframe so the
                  customer sees "preview only" right where they're about
                  to try to click. The amber notice above gives the long
                  version; this short one reinforces it visually now
                  that interaction is actually blocked. */}
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{
                  backgroundColor: "rgba(196,151,58,0.10)",
                  borderColor: "#c4973a",
                  color: "#c4973a",
                }}
              >
                <Info className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Preview only</strong> — availability shown for
                  reference. Your appointment is booked after you complete
                  your order.
                </span>
              </div>

              {/* Acuity iframe — wrapped in a `group` container so the
                  overlay's hover state can reveal the tap hint pill.
                  Strictly read-only: the overlay covers the entire
                  iframe and captures every pointer event, and the
                  iframe itself has pointer-events: none as a belt-and-
                  suspenders measure. Acuity has no native read-only
                  mode, so this is the only way to prevent real bookings
                  being made from the preview. DO NOT replicate on the
                  real booking step in CheckoutSuccessV2. */}
              <div
                className="group relative rounded-lg overflow-hidden border"
                style={{ borderColor: "#2d6b35", backgroundColor: "#0f2614" }}
              >
                {!iframeLoaded && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10"
                    style={{ backgroundColor: "#0f2614" }}
                  >
                    <Loader2
                      className="w-6 h-6 animate-spin"
                      style={{ color: "#c4973a" }}
                    />
                    <p className="text-xs" style={{ color: "#e8d5a3" }}>
                      Loading scheduler…
                    </p>
                  </div>
                )}
                <iframe
                  src={ACUITY_EMBED_URL}
                  title="FloLabs collection availability preview"
                  onLoad={() => setIframeLoaded(true)}
                  className="w-full block"
                  style={{
                    height: "600px",
                    border: "none",
                    backgroundColor: "transparent",
                    // Belt-and-suspenders: if the overlay above ever
                    // fails to mount, the iframe still can't receive
                    // clicks/taps.
                    pointerEvents: "none",
                  }}
                />
                {/* Interaction-blocking overlay. Visually near-
                    transparent so the calendar reads through; pointer
                    events are captured here and never reach the iframe.
                    The centered pill fades in on hover/tap so the
                    customer gets an immediate, subtle reason why
                    clicking the calendar did nothing. */}
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center"
                  style={{
                    backgroundColor: "transparent",
                    cursor: "not-allowed",
                  }}
                  aria-hidden="true"
                  role="presentation"
                >
                  <span
                    className="pointer-events-none rounded-full px-3 py-1.5 text-xs font-semibold border opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
                    style={{
                      backgroundColor: "rgba(15, 38, 20, 0.92)",
                      borderColor: "#c4973a",
                      color: "#c4973a",
                      boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                    }}
                  >
                    Booking available after checkout
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className="p-5 border-t shrink-0"
              style={{ borderColor: "#2d6b35" }}
            >
              <button
                type="button"
                onClick={closeModal}
                className="w-full sm:w-auto sm:ml-auto sm:flex inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
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
