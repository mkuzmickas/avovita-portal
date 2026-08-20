"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PatientGroup } from "@/app/(admin)/admin/mayo/invoices/[id]/page";
import type { OrderCandidate } from "@/lib/mayo/match-candidates";

interface Props {
  invoiceId: string;
  /** USD → CAD multiplier from mayo_invoices.fx_rate. Used to compute
   *  every displayed CAD figure client-side so the matcher stays in
   *  sync with whatever rate is stored on the invoice. */
  fxRate: number;
  patientGroups: PatientGroup[];
}

/**
 * The matcher UI. Left = patient groups from the invoice. Right =
 * candidate portal orders per selected patient (auto-computed by the
 * server). Drag a patient group onto a candidate to match every line
 * in that group to that order. Or click "Match" on a candidate row.
 *
 * Match granularity is per-LINE (not per-group) in the DB, but the UI
 * bulk-matches by group because Mayo bills the same accession's many
 * CPTs across separate rows and Mike thinks in "patient-visit" units.
 * The drag-drop applies the same order_id to all lines in the group.
 *
 * DOB is shown on candidate rows to disambiguate common names —
 * Mayo invoices don't carry DOB, so eyeballing this is how Mike
 * confirms "yes this Smith is that Smith".
 */
export function MayoInvoiceMatcher({
  invoiceId,
  fxRate,
  patientGroups,
}: Props) {
  const router = useRouter();
  const [savingFx, setSavingFx] = useState(false);
  const [fxInput, setFxInput] = useState(fxRate.toFixed(4));
  const [fxMsg, setFxMsg] = useState<string | null>(null);
  const saveFx = async () => {
    setSavingFx(true);
    setFxMsg(null);
    try {
      const parsed = parseFloat(fxInput);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) {
        throw new Error("FX rate must be a positive number under 10.");
      }
      const res = await fetch(
        `/api/admin/mayo/invoices/${invoiceId}/fx-rate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fx_rate: parsed }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFxMsg(`Saved. Reloading…`);
      router.refresh();
    } catch (err) {
      setFxMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingFx(false);
    }
  };
  const [selectedPatient, setSelectedPatient] = useState<string | null>(
    patientGroups.find((g) => g.lines.some((l) => !l.order_id))?.patient_name ??
      patientGroups[0]?.patient_name ??
      null,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [flash, setFlash] = useState<{
    patient: string;
    msg: string;
    ok: boolean;
  } | null>(null);

  const selected = useMemo(
    () => patientGroups.find((g) => g.patient_name === selectedPatient) ?? null,
    [patientGroups, selectedPatient],
  );

  const applyMatchToGroup = async (
    group: PatientGroup,
    orderId: string | null,
  ) => {
    setSaving(group.patient_name);
    setFlash(null);
    let ok = 0;
    let fail = 0;
    for (const line of group.lines) {
      // Skip lines already matched to this same order.
      if (line.order_id === orderId) continue;
      const res = await fetch(
        `/api/admin/mayo/invoices/${invoiceId}/match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_id: line.id, order_id: orderId }),
        },
      );
      if (res.ok) ok++;
      else fail++;
    }
    setSaving(null);
    setFlash({
      patient: group.patient_name,
      ok: fail === 0,
      msg:
        fail === 0
          ? orderId
            ? `Matched ${ok} line${ok === 1 ? "" : "s"}.`
            : `Unmatched ${ok} line${ok === 1 ? "" : "s"}.`
          : `${ok} saved, ${fail} failed.`,
    });
    router.refresh();
  };

  const onDragStartGroup = (
    e: React.DragEvent<HTMLDivElement>,
    group: PatientGroup,
  ) => {
    e.dataTransfer.setData("application/x-mayo-patient", group.patient_name);
    e.dataTransfer.effectAllowed = "link";
  };

  const onDropCandidate = (
    e: React.DragEvent<HTMLDivElement>,
    orderId: string,
  ) => {
    e.preventDefault();
    const patient = e.dataTransfer.getData("application/x-mayo-patient");
    const group = patientGroups.find((g) => g.patient_name === patient);
    if (group) applyMatchToGroup(group, orderId);
  };

  return (
    <>
      {/* FX rate strip — editable per invoice */}
      <div
        style={{
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #2d6b35",
          backgroundColor: "#0f2614",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: "#c4973a",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            USD → CAD rate for this invoice
          </div>
          <div style={{ color: "#e8d5a3", fontSize: 12, marginTop: 2 }}>
            Every CAD figure below is USD × this rate. Default 1.43 (Amex
            spread on foreign txn); override if you know the actual rate
            AvoVita paid.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginLeft: "auto",
          }}
        >
          <input
            type="number"
            step="0.0001"
            min="0.5"
            max="3"
            value={fxInput}
            onChange={(e) => setFxInput(e.target.value)}
            disabled={savingFx}
            style={{
              width: 90,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #2d6b35",
              backgroundColor: "#0a1a0d",
              color: "#ffffff",
              fontFamily: "monospace",
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={saveFx}
            disabled={savingFx || Math.abs(parseFloat(fxInput) - fxRate) < 0.00005}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              backgroundColor:
                savingFx || Math.abs(parseFloat(fxInput) - fxRate) < 0.00005
                  ? "#5a705f"
                  : "#c4973a",
              color: "#0a1a0d",
              fontSize: 12,
              fontWeight: 700,
              border: 0,
              cursor: savingFx ? "not-allowed" : "pointer",
            }}
          >
            {savingFx ? "Saving…" : "Save"}
          </button>
        </div>
        {fxMsg && (
          <div style={{ width: "100%", color: "#8dc63f", fontSize: 11 }}>
            {fxMsg}
          </div>
        )}
      </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(320px, 1fr) minmax(400px, 1.4fr)",
        gap: 16,
        alignItems: "start",
      }}
    >
      {/* LEFT — patient groups from the invoice */}
      <div
        style={{
          backgroundColor: "#0f2614",
          border: "1px solid #2d6b35",
          borderRadius: 10,
          padding: 12,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            color: "#c4973a",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
            paddingBottom: 8,
            borderBottom: "1px solid #2d6b35",
          }}
        >
          Patients on this invoice · {patientGroups.length}
        </div>
        {patientGroups.map((g) => {
          const allMatched = g.lines.every((l) => l.order_id);
          const someMatched = g.lines.some((l) => l.order_id);
          const isSelected = g.patient_name === selectedPatient;
          const isSaving = saving === g.patient_name;
          return (
            <div
              key={g.patient_name}
              draggable={!isSaving}
              onDragStart={(e) => onDragStartGroup(e, g)}
              onClick={() => setSelectedPatient(g.patient_name)}
              style={{
                padding: 10,
                borderRadius: 8,
                marginBottom: 6,
                cursor: isSaving ? "wait" : "grab",
                backgroundColor: isSelected ? "#1f4a28" : "#0a1a0d",
                border: `1px solid ${
                  allMatched
                    ? "#8dc63f"
                    : someMatched
                      ? "#c4973a"
                      : "#2d6b35"
                }`,
                opacity: isSaving ? 0.5 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {g.patient_name}
                  </div>
                  <div style={{ color: "#8dc63f", fontSize: 11 }}>
                    {g.lines.length} line{g.lines.length === 1 ? "" : "s"} ·{" "}
                    {formatUsdCad(g.total_charge_usd, fxRate)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    backgroundColor: allMatched
                      ? "rgba(141, 198, 63, 0.2)"
                      : someMatched
                        ? "rgba(196, 151, 58, 0.2)"
                        : "rgba(224, 82, 82, 0.15)",
                    color: allMatched
                      ? "#8dc63f"
                      : someMatched
                        ? "#c4973a"
                        : "#e88b8b",
                    height: 18,
                    lineHeight: "14px",
                  }}
                >
                  {allMatched ? "MATCHED" : someMatched ? "PARTIAL" : "OPEN"}
                </span>
              </div>
              {flash && flash.patient === g.patient_name && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: flash.ok ? "#8dc63f" : "#e88b8b",
                  }}
                >
                  {flash.msg}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* RIGHT — selected patient detail + candidates */}
      <div>
        {selected ? (
          <div
            style={{
              backgroundColor: "#0f2614",
              border: "1px solid #2d6b35",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                {selected.patient_name}
              </div>
              <div style={{ color: "#8dc63f", fontSize: 12, marginTop: 2 }}>
                Total {formatUsdCad(selected.total_charge_usd, fxRate)} ·{" "}
                {selected.lines.length} line
                {selected.lines.length === 1 ? "" : "s"}
                {selected.mayo_patient_id && (
                  <> · Mayo PID {selected.mayo_patient_id}</>
                )}
              </div>
            </div>

            {/* Lines table for this patient */}
            <div
              style={{
                marginBottom: 16,
                border: "1px solid #2d6b35",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: "#1a3d22" }}>
                    <th style={th}>Date</th>
                    <th style={th}>Accession</th>
                    <th style={th}>Test</th>
                    <th style={th}>Description</th>
                    <th style={{ ...th, textAlign: "right" }}>Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l) => (
                    <tr
                      key={l.id}
                      style={{ borderTop: "1px solid #1a3d22" }}
                    >
                      <td style={td}>{formatDate(l.collection_date)}</td>
                      <td style={{ ...td, fontFamily: "monospace" }}>
                        {l.accession_no}
                      </td>
                      <td style={td}>{l.test_id}</td>
                      <td style={{ ...td, color: "#8dc63f" }}>
                        {l.description ?? ""}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          color: "#c4973a",
                          fontWeight: 700,
                        }}
                      >
                        {formatUsdCad(Number(l.charge_usd), fxRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <CandidatesForSelected
              selected={selected}
              onDropCandidate={onDropCandidate}
              onMatch={(orderId) => applyMatchToGroup(selected, orderId)}
              onUnmatch={() => applyMatchToGroup(selected, null)}
              saving={saving === selected.patient_name}
            />
          </div>
        ) : (
          <div style={{ color: "#e8d5a3", padding: 20 }}>
            Pick a patient on the left.
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function CandidatesForSelected({
  selected,
  onDropCandidate,
  onMatch,
  onUnmatch,
  saving,
}: {
  selected: PatientGroup;
  onDropCandidate: (e: React.DragEvent<HTMLDivElement>, orderId: string) => void;
  onMatch: (orderId: string) => void;
  onUnmatch: () => void;
  saving: boolean;
}) {
  // If any line in the group is matched, show the linked order first.
  const currentMatch = selected.lines.find((l) => l.order_id);
  // Merge candidates across all lines in the group (they all share the
  // same patient_name + close dates, so candidate sets are near-identical).
  const allCandidates = new Map<string, OrderCandidate>();
  for (const l of selected.lines) {
    for (const c of l.candidates) {
      const existing = allCandidates.get(c.order_id);
      if (!existing || c.score > existing.score) {
        allCandidates.set(c.order_id, c);
      }
    }
  }
  const candidates = [...allCandidates.values()].sort(
    (a, b) => b.score - a.score,
  );

  return (
    <>
      {currentMatch && currentMatch.matched_order && (
        <div
          style={{
            border: "1px solid #8dc63f",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            backgroundColor: "rgba(141, 198, 63, 0.08)",
          }}
        >
          <div
            style={{
              color: "#8dc63f",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            Currently matched to
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 13 }}>
                {currentMatch.matched_order.patient_name}
                {currentMatch.matched_order.patient_dob && (
                  <span
                    style={{
                      color: "#8dc63f",
                      fontWeight: 400,
                      fontSize: 12,
                      marginLeft: 6,
                    }}
                  >
                    · DOB {currentMatch.matched_order.patient_dob}
                  </span>
                )}
              </div>
              <div style={{ color: "#8dc63f", fontSize: 11, marginTop: 2 }}>
                {formatDateTime(currentMatch.matched_order.appointment_at)} · Order{" "}
                {currentMatch.matched_order.id.slice(0, 8)}
              </div>
            </div>
            <button
              type="button"
              onClick={onUnmatch}
              disabled={saving}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                backgroundColor: "transparent",
                border: "1px solid #e88b8b",
                color: "#e88b8b",
                fontSize: 11,
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              Unmatch
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          color: "#c4973a",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        Candidate portal orders · drop patient here
      </div>
      {candidates.length === 0 ? (
        <div
          style={{
            color: "#e88b8b",
            fontSize: 12,
            padding: 12,
            border: "1px dashed #2d6b35",
            borderRadius: 8,
          }}
        >
          No candidate orders in the ±3-week window. Either the patient hasn&apos;t
          been onboarded on the portal (Mayo direct-billed request), or the
          collection date is unusually far off. Drop still works from a patient
          you know is right — pick from all patients using search (v2).
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {candidates.map((c) => {
            const isCurrent = currentMatch?.order_id === c.order_id;
            return (
              <div
                key={c.order_id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "link";
                }}
                onDrop={(e) => onDropCandidate(e, c.order_id)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${isCurrent ? "#8dc63f" : "#2d6b35"}`,
                  backgroundColor: isCurrent
                    ? "rgba(141, 198, 63, 0.08)"
                    : "#0a1a0d",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {c.patient_name}
                    {c.patient_dob && (
                      <span
                        style={{
                          color: "#c4973a",
                          fontWeight: 400,
                          fontSize: 12,
                          marginLeft: 6,
                        }}
                      >
                        · DOB {c.patient_dob}
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#8dc63f", fontSize: 11, marginTop: 2 }}>
                    {formatDateTime(c.appointment_at)} · Order{" "}
                    {c.order_id.slice(0, 8)} · {c.reason}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      minWidth: 42,
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: scoreColor(c.score),
                    }}
                  >
                    {c.score}
                  </div>
                  <button
                    type="button"
                    onClick={() => onMatch(c.order_id)}
                    disabled={saving || isCurrent}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      backgroundColor: isCurrent
                        ? "#5a705f"
                        : saving
                          ? "#5a705f"
                          : "#c4973a",
                      color: "#0a1a0d",
                      fontSize: 11,
                      fontWeight: 700,
                      border: 0,
                      cursor: saving || isCurrent ? "not-allowed" : "pointer",
                    }}
                  >
                    {isCurrent ? "Matched" : "Match"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── styling primitives ───────────────────────────────────────────────
const th: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  color: "#c4973a",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
const td: React.CSSProperties = {
  padding: "8px 10px",
  color: "#e8d5a3",
  verticalAlign: "top",
};

function scoreColor(n: number): string {
  if (n >= 85) return "#8dc63f";
  if (n >= 60) return "#c4973a";
  return "#e88b8b";
}
/**
 * Format a USD amount as "$X.XX USD → $Y.YY CAD" using the invoice's
 * fx_rate. This is the ONLY money formatter the matcher uses now that
 * all Mayo columns store raw USD.
 */
function formatUsdCad(usd: number, fxRate: number): string {
  const cad = usd * fxRate;
  return `${usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} → ${cad.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatDateTime(iso: string | null): string {
  if (!iso) return "no date";
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  });
}
