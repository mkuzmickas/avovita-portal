"use client";

import { useState } from "react";
import { Loader2, CheckCircle, AlertCircle, Send } from "lucide-react";

export function ResendConfirmationButton() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to resend");
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setErrorMsg("Network error — please try again");
      setState("error");
    }
  };

  if (state === "sent") {
    return (
      <div
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border"
        style={{
          backgroundColor: "rgba(141, 198, 63, 0.12)",
          borderColor: "#8dc63f",
          color: "#8dc63f",
        }}
      >
        <CheckCircle className="w-4 h-4" />
        Confirmation email sent — check your inbox
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={send}
        disabled={state === "sending"}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        style={{
          backgroundColor: "#c4973a",
          color: "#0a1a0d",
          opacity: state === "sending" ? 0.6 : 1,
        }}
      >
        {state === "sending" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {state === "sending" ? "Sending…" : "Resend Confirmation Email"}
      </button>
      {state === "error" && errorMsg && (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg text-xs border"
          style={{
            backgroundColor: "rgba(224, 82, 82, 0.12)",
            borderColor: "#e05252",
            color: "#e05252",
          }}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
