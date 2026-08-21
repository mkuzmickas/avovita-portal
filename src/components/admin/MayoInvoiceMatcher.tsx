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
  const [rematching, setRematching] = useState(false);
  const [rematchMsg, setRematchMsg] = useState<string | null>(null);
  const runRematch = async () => {
    setRematching(true);
    setRematchMsg(null);
    try {
      const res = await fetch(
        `/api/admin/mayo/invoices/${invoiceId}/rematch`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRematchMsg(
        `Re-matched ${data.autoMatched} more line${data.autoMatched === 1 ? "" : "s"} · ${data.unmatched} still unmatched.`,
      );
      router.refresh();
    } catch (err) {
      setRematchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRematching(false);
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

  const applyOverheadToGroup = async (
    group: PatientGroup,
    overhead: boolean,
  ) => {
    setSaving(group.patient_name);
    setFlash(null);
    const res = await fetch(
      `/api/admin/mayo/invoices/${invoiceId}/mark-overhead`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_ids: group.lines.map((l) => l.id),
          overhead,
        }),
      },
    );
    const data = await res.json();
    setSaving(null);
    setFlash({
      patient: group.patient_name,
      ok: res.ok,
      msg: res.ok
        ? overhead
          ? `Marked ${data.updated} line${data.updated === 1 ? "" : "s"} as overhead.`
          : `Cleared overhead flag on ${data.updated} line${data.updated === 1 ? "" : "s"}.`
        : `Failed: ${data.error ?? res.statusText}`,
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
          <button
            type="button"
            onClick={runRematch}
            disabled={rematching}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              backgroundColor: rematching ? "#5a705f" : "transparent",
              color: rematching ? "#e8d5a3" : "#c4973a",
              fontSize: 12,
              fontWeight: 700,
              border: `1px solid ${rematching ? "#5a705f" : "#c4973a"}`,
              cursor: rematching ? "not-allowed" : "pointer",
              marginLeft: 6,
            }}
            title="Re-run the auto-matcher on currently-unmatched lines. Manual matches are preserved."
          >
            {rematching ? "Re-matching…" : "Re-run auto-match"}
          </button>
        </div>
        {fxMsg && (
          <div style={{ width: "100%", color: "#8dc63f", fontSize: 11 }}>
            {fxMsg}
          </div>
        )}
        {rematchMsg && (
          <div style={{ width: "100%", color: "#8dc63f", fontSize: 11 }}>
            {rematchMsg}
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
          const allOverhead = g.lines.every((l) => l.no_portal_order);
          const someOverhead = g.lines.some((l) => l.no_portal_order);
          const allResolved = g.lines.every(
            (l) => l.order_id || l.no_portal_order,
          );
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
                    : allOverhead
                      ? "#8a9a8f"
                      : someMatched || someOverhead
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
                      : allOverhead
                        ? "rgba(138, 154, 143, 0.25)"
                        : someMatched || someOverhead
                          ? "rgba(196, 151, 58, 0.2)"
                          : "rgba(224, 82, 82, 0.15)",
                    color: allMatched
                      ? "#8dc63f"
                      : allOverhead
                        ? "#c8d0cb"
                        : someMatched || someOverhead
                          ? "#c4973a"
                          : "#e88b8b",
                    height: 18,
                    lineHeight: "14px",
                  }}
                >
                  {allMatched
                    ? "MATCHED"
                    : allOverhead
                      ? "OVERHEAD"
                      : allResolved
                        ? "PARTIAL"
                        : someMatched || someOverhead
                          ? "PARTIAL"
                          : "OPEN"}
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
              onMarkOverhead={(overhead) => applyOverheadToGroup(selected, overhead)}
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
  onMarkOverhead,
  saving,
}: {
  selected: PatientGroup;
  onDropCandidate: (e: React.DragEvent<HTMLDivElement>, orderId: string) => void;
  onMatch: (orderId: string) => void;
  onUnmatch: () => void;
  onMarkOverhead: (overhead: boolean) => void;
  saving: boolean;
}) {
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<OrderCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const runSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/admin/orders/search?q=${encodeURIComponent(q)}&limit=25`,
      );
      const data = await res.json();
      if (res.ok) setSearchResults((data.orders as OrderCandidate[]) ?? []);
    } finally {
      setSearching(false);
    }
  };
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

  const isOverhead = selected.lines.every((l) => l.no_portal_order);
  return (
    <>
      {isOverhead && (
        <div
          style={{
            border: "1px solid #8a9a8f",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            backgroundColor: "rgba(138, 154, 143, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                color: "#c8d0cb",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              Marked as overhead
            </div>
            <div style={{ color: "#e8d5a3", fontSize: 12 }}>
              This accession has no portal order — treated as internal/comp
              lab cost. Contributes to overhead, not COGS.
            </div>
          </div>
          <button
            type="button"
            onClick={() => onMarkOverhead(false)}
            disabled={saving}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              backgroundColor: "transparent",
              border: "1px solid #e8d5a3",
              color: "#e8d5a3",
              fontSize: 11,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Undo
          </button>
        </div>
      )}
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            color: "#c4973a",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Candidate portal orders · drop patient here
        </div>
        {!isOverhead && !currentMatch && (
          <button
            type="button"
            onClick={() => onMarkOverhead(true)}
            disabled={saving}
            title="Use for internal/comp Mayo orders that never went through the portal (Mike, Jenna, friends direct to Mayo). Cost is real but there's no client revenue tied to it."
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              backgroundColor: "transparent",
              border: "1px solid #8a9a8f",
              color: "#c8d0cb",
              fontSize: 11,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            No portal order (overhead)
          </button>
        )}
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
          No candidate orders in the window (−35 days / +5 days from Mayo&apos;s
          collection date, using appointment / shipping / charge date as the
          anchor). Either the patient isn&apos;t on the portal, the collection
          date is unusually far off, or the order was booked under a different
          spelling. Search-all-orders picker coming next; for now, drag from a
          patient you know is correct on the left.
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
                    {c.appointment_at
                      ? formatDateTime(c.appointment_at)
                      : c.created_at
                        ? `charge ${formatDateTime(c.created_at)}`
                        : "no date"}{" "}
                    · Order {c.order_id.slice(0, 8)}
                    {c.order_total_cad != null && (
                      <>
                        {" "}
                        · <span style={{ color: "#c4973a", fontWeight: 700 }}>
                          {formatCadShort(c.order_total_cad)}
                        </span>
                      </>
                    )}{" "}
                    · {c.reason}
                  </div>
                  {c.test_names.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 3,
                        marginTop: 6,
                      }}
                    >
                      {c.test_names.slice(0, 10).map((n, i) => {
                        const isMatch = (c.matched_test_names ?? []).includes(
                          n,
                        );
                        return (
                          <span
                            key={i}
                            style={{
                              display: "inline-block",
                              padding: "1px 6px",
                              borderRadius: 4,
                              backgroundColor: isMatch
                                ? "rgba(141, 198, 63, 0.30)"
                                : "rgba(255, 255, 255, 0.05)",
                              border: `1px solid ${isMatch ? "#8dc63f" : "rgba(255, 255, 255, 0.15)"}`,
                              fontSize: 10,
                              color: isMatch ? "#ffffff" : "#8a9a8f",
                              fontWeight: isMatch ? 600 : 400,
                            }}
                            title={n}
                          >
                            {n.length > 32 ? n.slice(0, 31) + "…" : n}
                          </span>
                        );
                      })}
                      {c.test_names.length > 10 && (
                        <span style={{ fontSize: 10, color: "#8dc63f" }}>
                          +{c.test_names.length - 10} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    title="Match score: base 100 · −1.5 per day off · +5 exact-name · +12 per matched test. Higher = better."
                    style={{
                      minWidth: 42,
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: scoreColor(c.score),
                      cursor: "help",
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

      {/* Search-all-orders picker — always available so Mike can find
          orders that fall outside the auto-suggester (wife paid for
          husband, name spelled differently, etc.). */}
      <div style={{ marginTop: 16 }}>
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
          Search all orders (any patient)
        </div>
        <input
          type="text"
          placeholder="Type a name or email (min 2 chars)…"
          value={searchQ}
          onChange={(e) => {
            setSearchQ(e.target.value);
            runSearch(e.target.value);
          }}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #2d6b35",
            backgroundColor: "#0a1a0d",
            color: "#ffffff",
            fontSize: 13,
          }}
        />
        {searching && (
          <div
            style={{ color: "#8dc63f", fontSize: 11, marginTop: 6 }}
          >
            Searching…
          </div>
        )}
        {searchResults.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 400,
              overflowY: "auto",
            }}
          >
            {searchResults.map((c) => {
              const isCurrent = false;
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
                    border: "1px solid #2d6b35",
                    backgroundColor: "#0a1a0d",
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
                    <div
                      style={{
                        color: "#8dc63f",
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {c.appointment_at
                        ? formatDateTime(c.appointment_at)
                        : c.created_at
                          ? `charge ${formatDateTime(c.created_at)}`
                          : "no date"}{" "}
                      · Order {c.order_id.slice(0, 8)}
                      {c.order_total_cad != null && (
                        <>
                          {" "}
                          ·{" "}
                          <span
                            style={{ color: "#c4973a", fontWeight: 700 }}
                          >
                            {formatCadShort(c.order_total_cad)}
                          </span>
                        </>
                      )}
                    </div>
                    {c.test_names.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 3,
                          marginTop: 6,
                        }}
                      >
                        {c.test_names.slice(0, 10).map((n, i) => (
                          <span
                            key={i}
                            style={{
                              display: "inline-block",
                              padding: "1px 6px",
                              borderRadius: 4,
                              backgroundColor: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.15)",
                              fontSize: 10,
                              color: "#8a9a8f",
                            }}
                            title={n}
                          >
                            {n.length > 32 ? n.slice(0, 31) + "…" : n}
                          </span>
                        ))}
                        {c.test_names.length > 10 && (
                          <span style={{ fontSize: 10, color: "#8dc63f" }}>
                            +{c.test_names.length - 10} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onMatch(c.order_id)}
                    disabled={saving || isCurrent}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      backgroundColor: saving ? "#5a705f" : "#c4973a",
                      color: "#0a1a0d",
                      fontSize: 11,
                      fontWeight: 700,
                      border: 0,
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    Match
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {!searching && searchQ.length >= 2 && searchResults.length === 0 && (
          <div style={{ color: "#e88b8b", fontSize: 11, marginTop: 6 }}>
            No orders matched — try a different spelling, first name, or the
            account holder&apos;s email.
          </div>
        )}
      </div>
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
function formatCadShort(n: number): string {
  return n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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
