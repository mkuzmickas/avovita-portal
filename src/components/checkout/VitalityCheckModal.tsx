"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Plus, Gift, Loader2, CheckCircle, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  VITALITY_CHECK_OPTIONS,
  VITALITY_CHECK_TERMS,
  VITALITY_CHECK_MIN_PAID_TESTS,
} from "@/lib/promo/vitalityCheck";
import type { CartItemTest } from "@/components/catalogue/types";

export interface VitalityOptionHydrated {
  sku: string;
  label: string;
  tagline: string;
  audience: string;
  /** DB test_id. Looked up server-side at render time so we don't bake
   *  UUIDs into code. */
  test_id: string;
  /** Retail price shown with strike-through so the gift feels concrete. */
  price_cad: number;
  /** Lab for the Stripe product description. */
  lab_name: string;
}

interface Props {
  /** "nudge" = client has 1 paid test; invites them to add a 2nd.
   *  "picker" = client has 2+ paid tests; prompts them to pick the
   *  free one. */
  variant: "nudge" | "picker";
  options: VitalityOptionHydrated[];
  onPick: (option: VitalityOptionHydrated) => void;
  onDismiss: () => void;
  /** Multi-person check — when the UI has detected that paid tests are
   *  split across different person_indexes, the picker shows a
   *  "same person required" notice and the Confirm button is
   *  disabled. */
  multiPersonConflict?: boolean;
}

/**
 * Vitality Check promo modal. Two variants share the same chrome —
 * nudge (pre-qualification) or picker (unlock).
 *
 * Opens from a trigger in CheckoutClient when the client reaches
 * step 1 with an eligible cart. Backdrop + escape dismiss without
 * side effect; parent persists the "dismissed this session" state.
 */
export function VitalityCheckModal({
  variant,
  options,
  onPick,
  onDismiss,
  multiPersonConflict = false,
}: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  const confirm = async () => {
    if (!picked) return;
    const choice = options.find((o) => o.sku === picked);
    if (!choice) return;
    setSubmitting(true);
    try {
      onPick(choice);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: "#0F2614",
          borderColor: "#C6A04B",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-start justify-between gap-3 border-b"
          style={{ borderColor: "#2d6b35", backgroundColor: "#1a3d22" }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <Gift
              className="w-6 h-6 shrink-0"
              style={{ color: "#C6A04B" }}
            />
            <div className="min-w-0">
              <h2
                className="font-heading text-xl font-semibold"
                style={{
                  color: "#ffffff",
                  fontFamily:
                    '"Playfair Display", "Cormorant Garamond", Georgia, serif',
                }}
              >
                {variant === "nudge"
                  ? "Add one more test — get your free Vitality Check"
                  : "Claim your free Vitality Check"}
              </h2>
              <p className="text-xs mt-1" style={{ color: "#8dc63f" }}>
                {variant === "nudge"
                  ? `Order ${VITALITY_CHECK_MIN_PAID_TESTS}+ tests and your Vitality Check is on us.`
                  : "Pick one of three options — included free with your order."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-md transition-colors shrink-0"
            style={{ color: "#C6A04B", backgroundColor: "rgba(196,151,58,0.1)" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div
          className="px-6 py-5 overflow-y-auto"
          style={{ flex: 1 }}
        >
          {variant === "nudge" && (
            <NudgeBody options={options} onDismiss={onDismiss} />
          )}

          {variant === "picker" && (
            <PickerBody
              options={options}
              picked={picked}
              setPicked={setPicked}
              multiPersonConflict={multiPersonConflict}
            />
          )}

          {/* T&Cs — shared between variants */}
          <div
            className="mt-5 rounded-lg border p-3"
            style={{
              backgroundColor: "rgba(196,151,58,0.06)",
              borderColor: "#2d6b35",
            }}
          >
            <div
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2"
              style={{ color: "#C6A04B", letterSpacing: "0.08em" }}
            >
              <Info className="w-3.5 h-3.5" />
              Promo terms
            </div>
            <ul
              className="space-y-1.5 text-xs leading-relaxed"
              style={{ color: "#e8d5a3" }}
            >
              {VITALITY_CHECK_TERMS.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span style={{ color: "#8dc63f" }}>·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 flex items-center justify-between gap-3 border-t flex-wrap"
          style={{ borderColor: "#2d6b35", backgroundColor: "#0a1a0d" }}
        >
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
            style={{
              color: "#e8d5a3",
              borderColor: "#2d6b35",
              backgroundColor: "transparent",
            }}
          >
            {variant === "nudge" ? "No thanks, continue" : "Skip the freebie"}
          </button>

          {variant === "nudge" ? (
            <Link
              href="/tests"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{
                backgroundColor: "#C6A04B",
                color: "#0a1a0d",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add another test
            </Link>
          ) : (
            <button
              type="button"
              onClick={confirm}
              disabled={!picked || submitting || multiPersonConflict}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{
                backgroundColor: "#C6A04B",
                color: "#0a1a0d",
                opacity: !picked || submitting || multiPersonConflict ? 0.5 : 1,
                cursor:
                  !picked || submitting || multiPersonConflict
                    ? "not-allowed"
                    : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              {submitting ? "Adding…" : "Claim free test"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NudgeBody({
  options,
  onDismiss,
}: {
  options: VitalityOptionHydrated[];
  onDismiss: () => void;
}) {
  return (
    <div>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: "#e8d5a3" }}
      >
        Your cart has <strong style={{ color: "#ffffff" }}>one test</strong>.
        Add any second paid test and your{" "}
        <strong>free Vitality Check</strong> comes with the order — your
        pick of:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        {options.map((o) => (
          <OptionCard key={o.sku} option={o} compact />
        ))}
      </div>
      <p
        className="text-xs italic mt-3"
        style={{ color: "#8dc63f" }}
      >
        Already know the second test you want? Tap{" "}
        <button
          type="button"
          onClick={onDismiss}
          className="underline"
          style={{ color: "#C6A04B" }}
        >
          Continue
        </button>{" "}
        and add it from the cart sidebar anytime.
      </p>
    </div>
  );
}

function PickerBody({
  options,
  picked,
  setPicked,
  multiPersonConflict,
}: {
  options: VitalityOptionHydrated[];
  picked: string | null;
  setPicked: (sku: string) => void;
  multiPersonConflict: boolean;
}) {
  return (
    <div>
      {multiPersonConflict && (
        <div
          className="mb-3 rounded-lg border p-3 text-xs"
          style={{
            backgroundColor: "rgba(224,82,82,0.08)",
            borderColor: "#e05252",
            color: "#e05252",
          }}
        >
          Your paid tests are split across more than one person. The free
          Vitality Check must go to the same person as the qualifying
          tests, so it isn&apos;t available on this order configuration.
          Adjust Step 2 assignments or skip the freebie.
        </div>
      )}
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: "#e8d5a3" }}
      >
        Pick one of the three options below — included free with your
        order. You can still change your mind up to checkout.
      </p>
      <div className="space-y-2">
        {options.map((o) => (
          <OptionCard
            key={o.sku}
            option={o}
            selected={picked === o.sku}
            onSelect={() => setPicked(o.sku)}
          />
        ))}
      </div>
    </div>
  );
}

function OptionCard({
  option,
  selected = false,
  onSelect,
  compact = false,
}: {
  option: VitalityOptionHydrated;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
}) {
  const interactive = !!onSelect;
  const body = (
    <div
      className="rounded-lg border px-3 py-2.5 transition-colors"
      style={{
        backgroundColor: selected
          ? "rgba(196,151,58,0.12)"
          : "#1a3d22",
        borderColor: selected ? "#C6A04B" : "#2d6b35",
        borderWidth: selected ? 2 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div
            className="text-sm font-semibold"
            style={{ color: "#ffffff" }}
          >
            {option.label}
          </div>
          <div className="text-xs" style={{ color: "#8dc63f" }}>
            {option.tagline}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-xs line-through"
            style={{ color: "#8dc63f" }}
          >
            {formatCurrency(option.price_cad)}
          </div>
          <div
            className="text-sm font-semibold"
            style={{ color: "#C6A04B" }}
          >
            FREE
          </div>
        </div>
      </div>
      {!compact && (
        <p
          className="text-xs mt-1 leading-relaxed"
          style={{ color: "#e8d5a3" }}
        >
          {option.audience}
        </p>
      )}
    </div>
  );
  if (!interactive) return body;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left"
      style={{ background: "transparent", border: "none", padding: 0 }}
    >
      {body}
    </button>
  );
}
