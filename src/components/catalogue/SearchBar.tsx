"use client";

import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional DOM id — exposed so another input (e.g. the hero
   *  search) can focus this one via document.getElementById. */
  inputId?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search by test name…",
  inputId,
}: SearchBarProps) {
  return (
    <div className="relative flex-1 min-w-[200px]">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
        style={{ color: "#6ab04c" }}
      />
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mf-input pl-10"
      />
    </div>
  );
}
