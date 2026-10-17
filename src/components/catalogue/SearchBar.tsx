"use client";

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
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mf-input"
      />
    </div>
  );
}
