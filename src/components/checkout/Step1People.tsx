"use client";

import { ArrowRight, User, Users, AlertCircle } from "lucide-react";
import Link from "next/link";
import type { OrderMode } from "./CheckoutClient";
import { useAnalytics } from "@/lib/analytics/useAnalytics";
import { useCart } from "@/components/cart/CartContext";

interface Step1PeopleProps {
  personCount: number;
  onPersonCountChange: (count: number) => void;
  onContinue: () => void;
  orderMode: OrderMode;
  onOrderModeChange: (mode: OrderMode) => void;
  permissionAcknowledged: boolean;
  onPermissionChange: (checked: boolean) => void;
}

/**
 * Step 1 — who's this order for?
 *
 * Two mutually-exclusive pickers (Mike, Oct 2026):
 *
 *   pick     orderMode   personCount
 *   -----    ---------   -----------
 *   single   self        1
 *   multi    self        2
 *
 * The old "Someone else" (caregiver) branch was folded into "single"
 * — the orderer can book for themselves OR on behalf of someone else
 * from the same single-person flow; the post-payment profile step is
 * where the actual patient's name/DOB/sex is captured, so a dependent
 * profile is handled downstream rather than needing its own Step-1
 * branch. Permission acknowledgement still fires when multiple people
 * are involved (Continue is disabled until checked).
 */
type Pick = "single" | "multi";

function pickForState(_orderMode: OrderMode, personCount: number): Pick {
  return personCount >= 2 ? "multi" : "single";
}

function stateForPick(pick: Pick): { mode: OrderMode; count: number } {
  return pick === "multi"
    ? { mode: "self", count: 2 }
    : { mode: "self", count: 1 };
}

export function Step1People({
  personCount,
  onPersonCountChange,
  onContinue,
  orderMode,
  onOrderModeChange,
  permissionAcknowledged,
  onPermissionChange,
}: Step1PeopleProps) {
  const { trackEvent } = useAnalytics();
  const { cart } = useCart();
  // Count only test line items — a cart of only supplements wouldn't
  // make sense for a multi-person split either.
  const testCount = cart
    .filter((c) => c.line_type === "test")
    .reduce((s, c) => s + c.quantity, 0);
  const pick = pickForState(orderMode, personCount);
  const needsPermission = pick === "multi";
  // Multi-person split needs at least 2 test items in the cart so there's
  // something to actually split across people. Mike's call: don't let
  // the user proceed to Step 2 with 1 test / 2 people — surface the
  // mismatch here and nudge them back to the catalogue.
  const multiButNotEnoughTests = pick === "multi" && testCount < 2;
  const canContinue =
    !multiButNotEnoughTests && (!needsPermission || permissionAcknowledged);

  const handlePermissionChange = (checked: boolean) => {
    onPermissionChange(checked);
    if (checked) {
      trackEvent("order_permission_acknowledged", { pick });
    }
  };

  const setPick = (next: Pick) => {
    const { mode, count } = stateForPick(next);
    onOrderModeChange(mode);
    onPersonCountChange(count);
    if (next !== pick) onPermissionChange(false);
  };

  return (
    <div
      className="rounded-2xl border p-6 sm:p-8"
      style={{ backgroundColor: "#FFFFFF", borderColor: "#E5E2D4" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5" style={{ color: "#C6A04B" }} />
        <p
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: "#C6A04B" }}
        >
          Step 1 of 4
        </p>
      </div>

      <h1
        className="font-heading text-3xl sm:text-4xl font-semibold mb-3"
        style={{
          color: "#092819",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Who is this <span style={{ color: "#C6A04B" }}>order for?</span>
      </h1>

      <p className="text-sm mb-4" style={{ color: "#154D31" }}>
        Adding someone else to this appointment costs $55, not another
        $85 visit — one phlebotomist, one trip, both collections done
        together.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <PickOption
          active={pick === "single"}
          onClick={() => setPick("single")}
          icon={<User className="w-5 h-5" />}
          title="Myself or on behalf of someone else"
          subtitle="Single booking, can include multiple tests."
        />
        <PickOption
          active={pick === "multi"}
          onClick={() => setPick("multi")}
          icon={<Users className="w-5 h-5" />}
          title="Two or more people at the same time & address"
          subtitle="Cart will be split in the next step."
        />
      </div>

      {/* Guardrail: can't split a 1-item cart across 2 people. Surfaces
          inline instead of letting the user hit a confusing dead end on
          Step 2's assignment grid. */}
      {multiButNotEnoughTests && (
        <div
          className="flex items-start gap-2.5 p-3 mb-4 rounded-lg border"
          style={{
            backgroundColor: "rgba(198,160,75,0.10)",
            borderColor: "#C6A04B",
          }}
        >
          <AlertCircle
            className="w-4 h-4 shrink-0 mt-0.5"
            style={{ color: "#C6A04B" }}
          />
          <p className="text-sm leading-relaxed" style={{ color: "#154D31" }}>
            You only have {testCount === 0 ? "no tests" : "1 test"} in your
            cart. To split across two or more people you&apos;ll need at
            least one test per person —{" "}
            <Link
              href="/tests"
              className="font-semibold underline"
              style={{ color: "#C6A04B" }}
            >
              go back and add additional tests
            </Link>
            , or pick the single-booking option above.
          </p>
        </div>
      )}

      {/* Permission ack — only required for the multi-person booking.
          The single-person flow treats "myself" and "on behalf of
          someone else" the same at this step; the actual patient's
          name/DOB is captured on Step 3 and the post-payment profile
          step, which handles the dependent-profile routing. */}
      {needsPermission && (
        <label
          className="flex items-start gap-2.5 p-3 mb-4 rounded-lg border cursor-pointer"
          style={{
            backgroundColor: permissionAcknowledged
              ? "rgba(141, 198, 63, 0.08)"
              : "#F7F6F0",
            borderColor: permissionAcknowledged ? "#88D45D" : "#E5E2D4",
          }}
        >
          <input
            type="checkbox"
            checked={permissionAcknowledged}
            onChange={(e) => handlePermissionChange(e.target.checked)}
            className="mt-0.5 shrink-0 cursor-pointer"
          />
          <span
            className="text-sm leading-relaxed"
            style={{
              color: permissionAcknowledged ? "#154D31" : "#154D31",
            }}
          >
            I confirm I have permission to order testing and receive
            results for the other person(s) on this booking.
          </span>
        </label>
      )}

      <p className="text-xs mb-6" style={{ color: "#4a7a56" }}>
        Testing with more than two people?{" "}
        <a
          href="mailto:support@avovita.ca?subject=Group%20booking%20—%20more%20than%202%20people"
          className="underline"
          style={{ color: "#C6A04B" }}
        >
          Contact us
        </a>{" "}
        and we&apos;ll arrange it.
      </p>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="mf-btn-primary w-full sm:w-auto px-6 py-3"
        style={{ opacity: canContinue ? 1 : 0.5, cursor: canContinue ? "pointer" : "not-allowed" }}
      >
        Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function PickOption({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border px-4 py-3 transition-colors h-full"
      style={{
        backgroundColor: active ? "rgba(196,151,58,0.12)" : "#F7F6F0",
        borderColor: active ? "#C6A04B" : "#E5E2D4",
      }}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: active ? "#C6A04B" : "#154D31" }}>{icon}</span>
        <span
          className="font-semibold text-sm"
          style={{ color: active ? "#C6A04B" : "#092819" }}
        >
          {title}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "#154D31" }}>
        {subtitle}
      </p>
    </button>
  );
}
