"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, X } from "lucide-react";

const STORAGE_KEY = "avovita-set-password-dismissed";

/**
 * Soft, dismissible prompt encouraging users who arrived via a magic-link
 * confirmation (auto-created accounts) to set a password for easy future
 * sign-in. We have no reliable server-side signal for "user has chosen
 * their own password" without a schema change, so this banner lives on
 * localStorage: it shows on first /portal visit, and stays dismissed
 * after the user clicks the X.
 */
export function SetPasswordBanner() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    setHidden(dismissed);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div
      className="mb-4 rounded-lg border px-4 py-3 flex items-start gap-3"
      style={{
        backgroundColor: "rgba(196, 151, 58, 0.08)",
        borderColor: "#c4973a",
      }}
    >
      <KeyRound
        className="w-4 h-4 mt-0.5 shrink-0"
        style={{ color: "#c4973a" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: "#ffffff" }}>
          Want to set a password for next time?{" "}
          <Link
            href="/forgot-password"
            className="font-semibold"
            style={{ color: "#c4973a", textDecoration: "underline" }}
          >
            Set one now
          </Link>{" "}
          — it&apos;s optional. You can always sign in via the link we email you.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="p-0.5 rounded transition-colors shrink-0"
        style={{ color: "#e8d5a3" }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
