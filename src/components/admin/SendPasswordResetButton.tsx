"use client";

import { useState } from "react";
import { KeyRound, Loader2, Check, AlertCircle } from "lucide-react";

interface SendPasswordResetButtonProps {
  accountId: string;
  /** Disabled when the account has no email — the API will 400
   *  anyway, but showing the client-side reason is nicer than a
   *  round-trip error toast. */
  hasEmail: boolean;
  email: string | null;
}

/**
 * Small pill button on the admin client detail page. Fires the
 * password reset email via POST /api/admin/patients/[id]/send-password-reset.
 * Non-idempotent — admin can re-fire if the customer keeps missing it.
 */
export function SendPasswordResetButton({
  accountId,
  hasEmail,
  email,
}: SendPasswordResetButtonProps) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!hasEmail) return;
    if (state === "sending") return;
    // Simple confirm — cheap safety net so a stray click doesn't ping
    // an unsuspecting customer with a reset link.
    const ok = window.confirm(
      `Send a password reset email to ${email}?\n\n` +
        "The customer will receive a branded AvoVita email with a " +
        "link valid for 60 minutes. You can re-send if they don't see it.",
    );
    if (!ok) return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/patients/${accountId}/send-password-reset`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setState("error");
        setError(body.error ?? `Send failed (HTTP ${res.status})`);
        return;
      }
      setState("sent");
      // Return to idle after a few seconds so the admin can send again
      // if the customer reports not receiving it.
      setTimeout(() => setState("idle"), 5000);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Send failed");
    }
  }

  const baseStyle: React.CSSProperties = {
    backgroundColor: "rgba(196, 151, 58, 0.10)",
    borderColor: "#c4973a",
    color: "#c4973a",
    cursor: hasEmail ? "pointer" : "not-allowed",
    opacity: hasEmail ? 1 : 0.5,
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={send}
        disabled={!hasEmail || state === "sending"}
        title={
          hasEmail
            ? `Send a password reset link to ${email}`
            : "Client has no email on file"
        }
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
        style={baseStyle}
      >
        {state === "sending" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : state === "sent" ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <KeyRound className="w-3.5 h-3.5" />
        )}
        {state === "sending"
          ? "Sending…"
          : state === "sent"
            ? "Reset email sent"
            : "Send password reset"}
      </button>
      {state === "error" && error && (
        <span
          className="inline-flex items-center gap-1 text-[11px]"
          style={{ color: "#e88b8b" }}
        >
          <AlertCircle className="w-3 h-3" />
          {error}
        </span>
      )}
    </div>
  );
}
