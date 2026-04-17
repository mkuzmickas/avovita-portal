"use client";

import Link from "next/link";
import { FlaskConical, Pill } from "lucide-react";

/**
 * Two-button segmented control toggling between /tests and /supplements.
 * Always visible — not gated by any feature flag.
 */
export function TestsSupplementsToggle({
  active,
}: {
  active: "tests" | "supplements";
}) {
  return (
    <div
      className="inline-flex rounded-lg border overflow-hidden"
      style={{ borderColor: "#c4973a" }}
    >
      <ToggleLink
        href="/tests"
        label="Lab Tests"
        icon={<FlaskConical className="w-4 h-4" />}
        isActive={active === "tests"}
      />
      <ToggleLink
        href="/supplements"
        label="Supplements"
        icon={<Pill className="w-4 h-4" />}
        isActive={active === "supplements"}
      />
    </div>
  );
}

function ToggleLink({
  href,
  label,
  icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors"
      style={
        isActive
          ? { backgroundColor: "#c4973a", color: "#0a1a0d" }
          : { backgroundColor: "transparent", color: "#c4973a" }
      }
    >
      {icon}
      {label}
    </Link>
  );
}
