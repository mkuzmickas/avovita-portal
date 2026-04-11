"use client";

import { ChevronDown } from "lucide-react";

interface CategoryFilterProps {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  allLabel?: string;
}

/**
 * Generic dark-theme dropdown filter. Used for both Category and Lab filters
 * in the catalogue table — passing null for `value` selects the All option.
 */
export function CategoryFilter({
  label,
  options,
  value,
  onChange,
  allLabel,
}: CategoryFilterProps) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="relative min-w-[180px]">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="mf-input appearance-none pr-9 cursor-pointer"
      >
        <option value="" style={{ backgroundColor: "#0f2614", color: "#ffffff" }}>
          {allLabel ?? `All ${label}`}
        </option>
        {options.map((opt) => (
          <option
            key={opt}
            value={opt}
            style={{ backgroundColor: "#0f2614", color: "#ffffff" }}
          >
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
        style={{ color: "#c4973a" }}
      />
    </div>
  );
}
