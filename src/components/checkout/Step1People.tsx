"use client";

import { ArrowRight, Users } from "lucide-react";

interface Step1PeopleProps {
  personCount: number;
  onPersonCountChange: (count: number) => void;
  onContinue: () => void;
}

const OPTIONS = [
  { value: 1, label: "Just myself" },
  { value: 2, label: "Myself and 1 other person" },
  { value: 3, label: "Myself and 2 other people" },
  { value: 4, label: "Myself and 3 other people" },
];

export function Step1People({
  personCount,
  onPersonCountChange,
  onContinue,
}: Step1PeopleProps) {
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
      <p className="text-sm mb-6" style={{ color: "#e8d5a3" }}>
        AvoVita supports collecting specimens from multiple people in a
        single home visit. All people must be at the same collection
        address. If anyone needs collection at a different location,
        please place a separate order for them.
      </p>

      <label
        className="block text-sm font-medium mb-1.5"
        style={{ color: "#e8d5a3" }}
      >
        Number of people
      </label>
      <select
        value={personCount}
        onChange={(e) => onPersonCountChange(Number(e.target.value))}
        className="mf-input cursor-pointer mb-6"
      >
        {OPTIONS.map((opt) => (
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
