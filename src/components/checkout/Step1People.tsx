"use client";

import { ArrowRight, Users, Heart } from "lucide-react";
import type { OrderMode } from "./CheckoutClient";

interface Step1PeopleProps {
  personCount: number;
  onPersonCountChange: (count: number) => void;
  onContinue: () => void;
  orderMode: OrderMode;
  onOrderModeChange: (mode: OrderMode) => void;
}

const SELF_OPTIONS = [
  { value: 1, label: "Just myself" },
  { value: 2, label: "Myself and 1 other person" },
  { value: 3, label: "Myself and 2 other people" },
  { value: 4, label: "Myself and 3 other people" },
];
const CAREGIVER_OPTIONS = [
  { value: 1, label: "1 client" },
  { value: 2, label: "2 clients" },
  { value: 3, label: "3 clients" },
  { value: 4, label: "4 clients" },
];

export function Step1People({
  personCount,
  onPersonCountChange,
  onContinue,
  orderMode,
  onOrderModeChange,
}: Step1PeopleProps) {
  const isCaregiver = orderMode === "caregiver";
  const options = isCaregiver ? CAREGIVER_OPTIONS : SELF_OPTIONS;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <ModeOption
          active={!isCaregiver}
          onClick={() => onOrderModeChange("self")}
          icon={<Users className="w-5 h-5" />}
          title="Myself"
          subtitle="I'm the person being tested (or ordering alongside family at the same address)."
        />
        <ModeOption
          active={isCaregiver}
          onClick={() => onOrderModeChange("caregiver")}
          icon={<Heart className="w-5 h-5" />}
          title="Someone in my care"
          subtitle="I'm a caregiver, POA, parent/guardian or healthcare worker ordering on behalf of a client."
        />
      </div>

      <p className="text-sm mb-6" style={{ color: "#e8d5a3" }}>
        {isCaregiver
          ? "You'll add the representative's contact info and POA confirmation on Step 3. All specimens must be collected at the same address — place a separate order if clients are at different locations."
          : "AvoVita supports collecting specimens from multiple people in a single home visit. Everyone must share the same collection address."}
      </p>

      <label
        className="block text-sm font-medium mb-1.5"
        style={{ color: "#e8d5a3" }}
      >
        {isCaregiver ? "Number of clients" : "Number of people"}
      </label>
      <select
        value={personCount}
        onChange={(e) => onPersonCountChange(Number(e.target.value))}
        className="mf-input cursor-pointer mb-6"
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ backgroundColor: "#0f2614", color: "#ffffff" }}
          >
            {opt.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onContinue}
        className="mf-btn-primary w-full sm:w-auto px-6 py-3"
      >
        Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function ModeOption({
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
      className="text-left rounded-xl border px-4 py-3 transition-colors"
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
