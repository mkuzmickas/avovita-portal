"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  UploadCloud,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  XCircle,
} from "lucide-react";
import {
  parsePendingBatchCsv,
  type ParsedPendingBatchRow,
} from "@/lib/mayo/parsePendingBatchCsv";

/**
 * Drag-drop a Pending Batch CSV → triage table → per-row Accept.
 *
 * Parsing happens in the browser (the parser is pure and ships in
 * the client bundle) so there's no upload step — the matching API is
 * a normal JSON POST with the parsed rows. The Accept API mutates
 * orders + writes audit rows.
 *
 * Re-import idempotency: rows with confidence='exact' AND
 * already_stamped=true render an "Already stamped" pill and disable
 * Accept; the same CSV can be dropped daily without noise.
 */

type Confidence = "exact" | "high" | "medium" | "low" | "none";

interface TriagePrimary {
  order_id: string;
  profile_id: string;
  score: number;
  reasoning: string;
  portal_order_short_id: string;
  portal_profile_label: string | null;
  already_stamped: boolean;
}

interface TriageAlt {
  order_id: string;
  profile_id: string;
  score: number;
  reasoning: string;
  portal_order_short_id: string;
}

interface TriageRow {
  csv_row: ParsedPendingBatchRow;
  confidence: Confidence;
  primary_match: TriagePrimary | null;
  alternatives: TriageAlt[];
  issues: string[];
}

type RowState =
  | { kind: "ready" }
  | { kind: "skipped" }
  | { kind: "accepting" }
  | { kind: "stamped"; message: string }
  | { kind: "already_stamped"; message: string }
  | { kind: "error"; message: string };

const CONFIDENCE_STYLE: Record<
  Confidence,
  { bg: string; border: string; color: string; label: string }
> = {
  exact: {
    bg: "rgba(141,198,63,0.15)",
    border: "#8dc63f",
    color: "#8dc63f",
    label: "Exact",
  },
  high: {
    bg: "rgba(106,176,76,0.15)",
    border: "#6ab04c",
    color: "#6ab04c",
    label: "High",
  },
  medium: {
    bg: "rgba(217,169,57,0.15)",
    border: "#d4a84a",
    color: "#d4a84a",
    label: "Medium",
  },
  low: {
    bg: "rgba(196,151,58,0.15)",
    border: "#c4973a",
    color: "#c4973a",
    label: "Low",
  },
  none: {
    bg: "rgba(224,82,82,0.15)",
    border: "#e05252",
    color: "#e05252",
    label: "None",
  },
};

export function PendingBatchImporter() {
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [triage, setTriage] = useState<TriageRow[] | null>(null);
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({});
  const [matching, setMatching] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const onFile = useCallback(async (file: File) => {
    setParseErrors([]);
    setTriage(null);
    setRowStates({});
    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseErrors(["File must have a .csv extension"]);
      return;
    }

    const text = await file.text();
    const parsed = parsePendingBatchCsv(text);
    if (!parsed.valid) {
      setParseErrors(parsed.errors);
      return;
    }

    setMatching(true);
    try {
      const res = await fetch("/api/admin/mayo/pending-batch/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setParseErrors([
          body.error ?? `Match request failed (HTTP ${res.status})`,
        ]);
        return;
      }
      const data = await res.json();
      const t = (data.triage ?? []) as TriageRow[];
      setTriage(t);
      // Seed row states. Already-stamped rows start as already_stamped
      // so the UI can mark them inert immediately.
      const initial: Record<number, RowState> = {};
      t.forEach((row, idx) => {
        if (row.primary_match?.already_stamped) {
          initial[idx] = {
            kind: "already_stamped",
            message: "Already stamped",
          };
        } else {
          initial[idx] = { kind: "ready" };
        }
      });
      setRowStates(initial);
    } finally {
      setMatching(false);
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) await onFile(f);
    },
    [onFile],
  );

  const counts = useMemo(() => {
    if (!triage) return { ready: 0, review: 0, unmatched: 0, alreadyStamped: 0 };
    let ready = 0;
    let review = 0;
    let unmatched = 0;
    let alreadyStamped = 0;
    triage.forEach((row, idx) => {
      const state = rowStates[idx];
      if (state?.kind === "stamped") return;
      if (state?.kind === "already_stamped" || row.primary_match?.already_stamped) {
        alreadyStamped++;
        return;
      }
      if (row.primary_match === null) {
        unmatched++;
        return;
      }
      if (row.confidence === "exact" || row.confidence === "high") {
        ready++;
      } else {
        review++;
      }
    });
    return { ready, review, unmatched, alreadyStamped };
  }, [triage, rowStates]);

  const acceptOne = useCallback(
    async (idx: number) => {
      const row = triage?.[idx];
      if (!row || !row.primary_match) return;
      setRowStates((s) => ({ ...s, [idx]: { kind: "accepting" } }));
      try {
        const res = await fetch("/api/admin/mayo/pending-batch/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [
              {
                order_id: row.primary_match.order_id,
                profile_id: row.primary_match.profile_id,
                csv_row: row.csv_row,
                confidence: row.confidence,
                reasoning: row.primary_match.reasoning,
              },
            ],
          }),
        });
        const data = await res.json();
        const result = data.results?.[0];
        if (!res.ok || !result) {
          setRowStates((s) => ({
            ...s,
            [idx]: { kind: "error", message: data.error ?? "Accept failed" },
          }));
          return;
        }
        if (result.outcome === "stamped") {
          setRowStates((s) => ({
            ...s,
            [idx]: { kind: "stamped", message: result.message },
          }));
        } else if (result.outcome === "already_stamped") {
          setRowStates((s) => ({
            ...s,
            [idx]: { kind: "already_stamped", message: result.message },
          }));
        } else {
          setRowStates((s) => ({
            ...s,
            [idx]: { kind: "error", message: result.message },
          }));
        }
      } catch (err) {
        setRowStates((s) => ({
          ...s,
          [idx]: {
            kind: "error",
            message: err instanceof Error ? err.message : "Network error",
          },
        }));
      }
    },
    [triage],
  );

  const acceptAllExact = useCallback(async () => {
    if (!triage) return;
    setBulkBusy(true);
    try {
      const targets = triage
        .map((row, idx) => ({ row, idx }))
        .filter(
          ({ row, idx }) =>
            (row.confidence === "exact" || row.confidence === "high") &&
            row.primary_match &&
            !row.primary_match.already_stamped &&
            rowStates[idx]?.kind === "ready",
        );
      for (const { idx } of targets) {
        // Run sequentially so order updates don't race each other and
        // the user sees the table update row-by-row.

        await acceptOne(idx);
      }
    } finally {
      setBulkBusy(false);
    }
  }, [triage, rowStates, acceptOne]);

  const skip = useCallback((idx: number) => {
    setRowStates((s) => ({ ...s, [idx]: { kind: "skipped" } }));
  }, []);

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <label
        htmlFor="mayo-csv-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="block rounded-2xl border-2 border-dashed p-8 cursor-pointer transition-colors"
        style={{
          borderColor: dragOver ? "#c4973a" : "#2d6b35",
          backgroundColor: dragOver ? "#1a3d22" : "#0f2614",
        }}
      >
        <input
          id="mayo-csv-input"
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <div className="flex flex-col items-center gap-3 text-center">
          <UploadCloud className="w-10 h-10" style={{ color: "#c4973a" }} />
          <div>
            <p className="font-semibold" style={{ color: "#ffffff" }}>
              {fileName ?? "Drop the Pending Batch CSV here"}
            </p>
            <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
              or click to browse · .csv only
            </p>
          </div>
        </div>
      </label>

      {parseErrors.length > 0 && (
        <div
          className="rounded-xl border px-4 py-3 flex items-start gap-3"
          style={{
            backgroundColor: "rgba(224,82,82,0.10)",
            borderColor: "#e05252",
          }}
        >
          <XCircle
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: "#e05252" }}
          />
          <div className="text-sm" style={{ color: "#ffeaea" }}>
            {parseErrors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </div>
      )}

      {matching && (
        <div
          className="rounded-xl border px-4 py-6 flex items-center justify-center gap-2"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: "#c4973a" }}
          />
          <p style={{ color: "#e8d5a3" }}>Matching rows against portal…</p>
        </div>
      )}

      {triage && triage.length > 0 && (
        <>
          {/* Bulk actions header */}
          <div
            className="rounded-xl border p-4 flex flex-wrap items-center gap-3"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <div className="text-sm" style={{ color: "#e8d5a3" }}>
              <strong style={{ color: "#8dc63f" }}>{counts.ready}</strong> ready to accept ·{" "}
              <strong style={{ color: "#d4a84a" }}>{counts.review}</strong> need review ·{" "}
              <strong style={{ color: "#e05252" }}>{counts.unmatched}</strong> unmatched
              {counts.alreadyStamped > 0 && (
                <>
                  {" "}·{" "}
                  <strong style={{ color: "#6ab04c" }}>{counts.alreadyStamped}</strong>{" "}
                  already stamped
                </>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={acceptAllExact}
                disabled={counts.ready === 0 || bulkBusy}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
              >
                {bulkBusy ? "Working…" : `Accept ${counts.ready} ready`}
              </button>
              <button
                onClick={() => {
                  triage.forEach((row, idx) => {
                    if (row.primary_match === null && rowStates[idx]?.kind === "ready") {
                      setRowStates((s) => ({ ...s, [idx]: { kind: "skipped" } }));
                    }
                  });
                }}
                disabled={counts.unmatched === 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold border disabled:opacity-40"
                style={{
                  borderColor: "#2d6b35",
                  color: "#e8d5a3",
                  backgroundColor: "transparent",
                }}
              >
                Skip all unmatched
              </button>
            </div>
          </div>

          {/* Triage table */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#0f2614" }}>
                    {[
                      "Mayo Order #",
                      "Patient",
                      "DOB",
                      "Tests",
                      "Match",
                      "Confidence",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                        style={{
                          color: "#c4973a",
                          fontFamily: '"DM Sans", sans-serif',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {triage.map((row, idx) => (
                    <TriageRowView
                      key={`${row.csv_row.mayo_order_number}-${idx}`}
                      row={row}
                      state={rowStates[idx] ?? { kind: "ready" }}
                      idx={idx}
                      onAccept={() => acceptOne(idx)}
                      onSkip={() => skip(idx)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {triage && triage.length === 0 && (
        <div
          className="rounded-xl border px-6 py-12 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <FileText
            className="w-10 h-10 mx-auto mb-3"
            style={{ color: "#2d6b35" }}
          />
          <p style={{ color: "#e8d5a3" }}>
            The CSV parsed cleanly but contained no rows.
          </p>
        </div>
      )}
    </div>
  );
}

interface TriageRowViewProps {
  row: TriageRow;
  state: RowState;
  idx: number;
  onAccept: () => void;
  onSkip: () => void;
}

function TriageRowView({ row, state, onAccept, onSkip }: TriageRowViewProps) {
  const conf = CONFIDENCE_STYLE[row.confidence];
  const csvRow = row.csv_row;
  const primary = row.primary_match;
  const testsLabel =
    csvRow.tests.length === 0
      ? "—"
      : csvRow.tests.length <= 3
        ? csvRow.tests.map((t) => t.sku).join(", ")
        : `${csvRow.tests.slice(0, 3).map((t) => t.sku).join(", ")} +${csvRow.tests.length - 3} more`;

  const isFinal =
    state.kind === "stamped" ||
    state.kind === "already_stamped" ||
    state.kind === "skipped";

  return (
    <>
      <tr
        style={{
          backgroundColor: isFinal ? "#0f2614" : "#0a1a0d",
          opacity: state.kind === "skipped" ? 0.5 : 1,
        }}
      >
        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" style={{ color: "#e8d5a3" }}>
          {csvRow.mayo_order_number || "—"}
        </td>
        <td className="px-4 py-3" style={{ color: "#ffffff" }}>
          <div>
            {csvRow.last_name}, {csvRow.first_name}
          </div>
          <div className="text-xs font-mono" style={{ color: "#6ab04c" }}>
            MRN {csvRow.mayo_patient_id || "—"}
          </div>
        </td>
        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#e8d5a3" }}>
          {csvRow.date_of_birth || "—"}
        </td>
        <td className="px-4 py-3 text-xs" style={{ color: "#e8d5a3" }}>
          <div>{csvRow.tests.length} test{csvRow.tests.length === 1 ? "" : "s"}</div>
          <div className="font-mono" style={{ color: "#6ab04c" }}>
            {testsLabel}
          </div>
        </td>
        <td className="px-4 py-3 text-xs" style={{ color: "#e8d5a3" }}>
          {primary ? (
            <div>
              <Link
                href={`/admin/orders`}
                target="_blank"
                className="inline-flex items-center gap-1 font-mono underline"
                style={{ color: "#c4973a" }}
              >
                #{primary.portal_order_short_id}
                <ExternalLink className="w-3 h-3" />
              </Link>
              <div style={{ color: "#6ab04c" }}>
                {primary.portal_profile_label ?? ""}
              </div>
            </div>
          ) : (
            <div>
              <span style={{ color: "#e05252" }}>—</span>
              <div className="text-[11px] mt-0.5" style={{ color: "#e8d5a3" }}>
                {row.issues[0] ?? "No match"}
              </div>
            </div>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
            style={{
              backgroundColor: conf.bg,
              borderColor: conf.border,
              color: conf.color,
            }}
          >
            {conf.label}
          </span>
        </td>
        <td className="px-4 py-3">
          <ActionsCell
            row={row}
            state={state}
            onAccept={onAccept}
            onSkip={onSkip}
          />
        </td>
      </tr>
      {/* Sub-row: state messages + alternatives */}
      {(state.kind === "stamped" ||
        state.kind === "already_stamped" ||
        state.kind === "error" ||
        row.alternatives.length > 0 ||
        row.issues.length > 0 ||
        row.csv_row.warnings.length > 0) && (
        <tr style={{ backgroundColor: "#0f2614" }}>
          <td colSpan={7} className="px-4 py-2 text-xs" style={{ color: "#e8d5a3" }}>
            {state.kind === "stamped" && (
              <div className="flex items-start gap-2" style={{ color: "#8dc63f" }}>
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{state.message}</span>
              </div>
            )}
            {state.kind === "already_stamped" && (
              <div className="flex items-start gap-2" style={{ color: "#6ab04c" }}>
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{state.message}</span>
              </div>
            )}
            {state.kind === "error" && (
              <div className="flex items-start gap-2" style={{ color: "#e05252" }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{state.message}</span>
              </div>
            )}
            {row.alternatives.length > 0 && (
              <div className="mt-1">
                <div style={{ color: "#c4973a" }}>Alternatives:</div>
                {row.alternatives.map((a) => (
                  <div key={a.order_id} className="ml-3">
                    <span className="font-mono">#{a.portal_order_short_id}</span>{" "}
                    — {a.reasoning}
                  </div>
                ))}
              </div>
            )}
            {row.issues.length > 0 && (
              <div className="mt-1" style={{ color: "#d4a84a" }}>
                {row.issues.map((m, i) => (
                  <div key={i}>· {m}</div>
                ))}
              </div>
            )}
            {row.csv_row.warnings.length > 0 && (
              <div className="mt-1" style={{ color: "#d4a84a" }}>
                {row.csv_row.warnings.map((m, i) => (
                  <div key={i}>· parse warning: {m}</div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ActionsCell({
  row,
  state,
  onAccept,
  onSkip,
}: {
  row: TriageRow;
  state: RowState;
  onAccept: () => void;
  onSkip: () => void;
}) {
  if (state.kind === "accepting") {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#c4973a" }}>
        <Loader2 className="w-3 h-3 animate-spin" /> Working…
      </span>
    );
  }
  if (state.kind === "stamped") {
    return (
      <span className="text-xs" style={{ color: "#8dc63f" }}>
        Stamped
      </span>
    );
  }
  if (state.kind === "already_stamped") {
    return (
      <span className="text-xs" style={{ color: "#6ab04c" }}>
        No action
      </span>
    );
  }
  if (state.kind === "skipped") {
    return (
      <span className="text-xs" style={{ color: "#e8d5a3" }}>
        Skipped
      </span>
    );
  }
  if (row.primary_match === null) {
    return (
      <button
        onClick={onSkip}
        className="text-xs underline"
        style={{ color: "#e8d5a3" }}
      >
        Skip
      </button>
    );
  }
  const isStrong = row.confidence === "exact" || row.confidence === "high";
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onAccept}
        className="px-3 py-1 rounded text-xs font-semibold"
        style={
          isStrong
            ? { backgroundColor: "#c4973a", color: "#0a1a0d" }
            : { border: "1px solid #c4973a", color: "#c4973a" }
        }
      >
        {isStrong ? "Accept" : "Confirm match"}
      </button>
      <button
        onClick={onSkip}
        className="text-xs underline"
        style={{ color: "#e8d5a3" }}
      >
        Skip
      </button>
    </div>
  );
}
