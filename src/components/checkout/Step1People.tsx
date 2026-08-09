"use client";

import { ArrowRight, User, Users, UserCheck } from "lucide-react";
import type { OrderMode } from "./CheckoutClient";
import { useAnalytics } from "@/lib/analytics/useAnalytics";

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
 * Three mutually-exclusive pickers driven by the combination of
 * (orderMode, personCount):
 *
 *   pick             orderMode    personCount
 *   -------------    ---------    -----------
 *   Just myself      self         1
 *   Me + someone     self         2
 *   Someone else     caregiver    1
 *
 * The "someone else" flavour used to be gated behind a POA / caregiver
 * / healthcare-worker representative form on Step 3. That's gone —
 * Mike wants a lighter model: a single "I have permission" checkbox
 * that covers us legally, plus a note reminding the customer that the
 * post-payment account will be set up in the tested person's name
 * (not the orderer's), so results attribute correctly.
 *
 * When "Me + someone" or "Someone else" is picked, the permission ack
 * is required; Continue is disabled until it's checked. When "Someone
 * else" is picked, an additional note surfaces about account naming.
 */
type Pick = "self_only" | "self_plus" | "other_only";

function pickForState(orderMode: OrderMode, personCount: number): Pick {
  if (orderMode === "caregiver") return "other_only";
  if (personCount >= 2) return "self_plus";
  return "self_only";
}

function stateForPick(pick: Pick): { mode: OrderMode; count: number } {
  switch (pick) {
    case "self_only":
      return { mode: "self", count: 1 };
    case "self_plus":
      return { mode: "self", count: 2 };
    case "other_only":
      return { mode: "caregiver", count: 1 };
  }
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
  const pick = pickForState(orderMode, personCount);
  const needsPermission = pick === "self_plus" || pick === "other_only";
  const isOtherOnly = pick === "other_only";
  const canContinue = !needsPermission || permissionAcknowledged;

  const handlePermissionChange = (checked: boolean) => {
    onPermissionChange(checked);
    // Auditable event — the events table records timestamp + session,
    // giving a defensible legal record that the customer ticked the
    // acknowledgement box for this specific order mode. A proper
    // orders column lands in the DOB/sex post-payment phase.
    if (checked) {
      trackEvent("order_permission_acknowledged", { pick });
    }
  };

  const setPick = (next: Pick) => {
    const { mode, count } = stateForPick(next);
    onOrderModeChange(mode);
    onPersonCountChange(count);
    // Reset the permission ack on any pick change so a customer who
    // ticks it, switches to Just myself, then switches back doesn't
    // silently re-consent without re-reading.
    if (next !== pick) onPermissionChange(false);
  };

  return (
    <div
      className="rounded-2xl border p-6 sm:p-8"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5" style={{ color: "#c4973a" }} />
        <p
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: "#c4973a" }}
        >
          Step 1 of 4
        </p>
      </div>

      <h1
        className="font-heading text-3xl sm:text-4xl font-semibold mb-3"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Who is this <span style={{ color: "#c4973a" }}>order for?</span>
      </h1>

      <p className="text-sm mb-4" style={{ color: "#e8d5a3" }}>
        Adding someone else to this appointment costs $55, not another
        $85 visit — one phlebotomist, one trip, both collections done
        together.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <PickOption
          active={pick === "self_only"}
          onClick={() => setPick("self_only")}
          icon={<User className="w-5 h-5" />}
          title="Just myself"
          subtitle="I'm the one being tested."
        />
        <PickOption
          active={pick === "self_plus"}
          onClick={() => setPick("self_plus")}
          icon={<Users className="w-5 h-5" />}
          title="Myself and someone else"
          subtitle="Two people, one collection appointment at the same address."
        />
        <PickOption
          active={pick === "other_only"}
          onClick={() => setPick("other_only")}
          icon={<UserCheck className="w-5 h-5" />}
          title="Someone else"
          subtitle="I'm ordering on their behalf."
        />
      </div>

      {/* Permission acknowledgement — required when someone other than
          the account holder is being tested. Reset on every pick change
          so it can't be inherited from a previous selection. */}
      {needsPermission && (
        <label
          className="flex items-start gap-2.5 p-3 mb-4 rounded-lg border cursor-pointer"
          style={{
            backgroundColor: permissionAcknowledged
              ? "rgba(141, 198, 63, 0.08)"
              : "#0f2614",
            borderColor: permissionAcknowledged ? "#8dc63f" : "#2d6b35",
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
              color: permissionAcknowledged ? "#8dc63f" : "#e8d5a3",
            }}
          >
            I confirm I have permission to order testing and receive
            results for {pick === "self_plus" ? "the other person" : "this person"}.
          </span>
        </label>
      )}

      {/* Note for "someone else" only — the post-payment account will
          be set up in the tested person's name so lab results attribute
          correctly. Doesn't show for "myself + someone" because the
          account holder is still one of the people being tested. */}
      {isOtherOnly && (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2.5 mb-4"
          style={{
            backgroundColor: "rgba(196, 151, 58, 0.08)",
            borderColor: "#c4973a",
          }}
        >
          <UserCheck
            className="w-4 h-4 shrink-0 mt-0.5"
            style={{ color: "#c4973a" }}
          />
          <p className="text-xs leading-relaxed" style={{ color: "#e8d5a3" }}>
            After payment we&apos;ll create the account in{" "}
            <strong style={{ color: "#ffffff" }}>
              the name and date of birth of the person being tested
            </strong>{" "}
            — that&apos;s how results are matched to the right person on
            the portal.
          </p>
        </div>
      )}

      <p className="text-xs mb-6" style={{ color: "#6ab04c" }}>
        Testing with more than two people?{" "}
        <a
          href="mailto:support@avovita.ca?subject=Group%20booking%20—%20more%20than%202%20people"
          className="underline"
          style={{ color: "#c4973a" }}
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
        backgroundColor: active ? "rgba(196,151,58,0.12)" : "#0f2614",
        borderColor: active ? "#c4973a" : "#2d6b35",
      }}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: active ? "#c4973a" : "#6ab04c" }}>{icon}</span>
        <span
          className="font-semibold text-sm"
          style={{ color: active ? "#c4973a" : "#ffffff" }}
        >
          {title}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "#e8d5a3" }}>
        {subtitle}
      </p>
    </button>
  );
}
