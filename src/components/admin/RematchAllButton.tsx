"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

interface RematchResult {
  scanned: number;
  reparsed: number;
  auto_assigned: number;
  still_needs_review: number;
  still_no_match: number;
  errored: number;
}

/**
 * One-click bulk re-parse + re-match for every row in the booking
 * review queue. Useful after a parser upgrade (e.g. new TZ handling,
 * new Acuity template support) to retroactively fix rows that were
 * ingested under the old parser.
 */
export function RematchAllButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<RematchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState("running");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bookings/rematch-all", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        setState("error");
        return;
      }
      setResult(data as RematchResult);
      setState("done");
      // Server-component queue refreshes so the resolved rows drop
      // out of the list immediately.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setState("error");
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
        style={{
          backgroundColor: state === "running" ? "transparent" : "#c4973a",
          color: state === "running" ? "#c4973a" : "#0a1a0d",
          borderColor: "#c4973a",
          opacity: state === "running" ? 0.75 : 1,
          cursor: state === "running" ? "wait" : "pointer",
        }}
      >
        {state === "running" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" />
        )}
        {state === "running" ? "Re-parsing…" : "Re-parse all stuck rows"}
      </button>
      {state === "done" && result && (
        <div
          className="inline-flex items-center gap-2 text-xs"
          style={{ color: "#8dc63f" }}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Scanned {result.scanned} ·{" "}
          <strong>{result.auto_assigned} auto-assigned</strong>,{" "}
          {result.still_needs_review} still need review,{" "}
          {result.still_no_match} no match
          {result.errored > 0 ? ` · ${result.errored} errored` : ""}
        </div>
      )}
      {state === "error" && error && (
        <div
          className="inline-flex items-center gap-2 text-xs"
          style={{ color: "#e88b8b" }}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
    </div>
  );
}
