"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface EnrichedRow {
  batch_no: string;
  order_no: string;
  ml_accession: string | null;
  mayo_patient_id: string | null;
  patient_name_on_sheet: string | null;
  collected_at: string | null;
  order_id: string | null;
  match_key: "web" | "ml" | "mrn" | "name+date" | null;
  order_status: string | null;
  order_total_cad: number | null;
  order_tracking_number: string | null;
  order_shipped_at: string | null;
  portal_patient_name: string | null;
}

interface ParseResult {
  ok: true;
  batches: string[];
  rows: EnrichedRow[];
  matched: number;
  unmatched: number;
  warnings: string[];
}

/**
 * Top-of-Orders drop zone: drop a Mayo Clinic batch sheet PDF →
 * preview matched orders → enter one FedEx tracking number → assign
 * to every matched order in one shot (which also fires the same
 * SMS + email 'your specimens have shipped' notifications as the
 * per-order shipping flow).
 */
export function MayoBatchShipmentUpload() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tracking, setTracking] = useState("");
  const [shippingDate, setShippingDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<string | null>(null);

  const reset = () => {
    setPreview(null);
    setTracking("");
    setErrorMsg(null);
    setAssignResult(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const upload = async (file: File) => {
    setBusy(true);
    setErrorMsg(null);
    setPreview(null);
    setAssignResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/mayo/batch-sheet/parse", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPreview(data as ParseResult);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const confirm = async () => {
    if (!preview) return;
    if (tracking.trim().length < 8) {
      setErrorMsg("Enter a FedEx tracking number (12–15 digits).");
      return;
    }
    setAssigning(true);
    setErrorMsg(null);
    const orderIds = preview.rows
      .map((r) => r.order_id)
      .filter((v): v is string => Boolean(v));
    try {
      const res = await fetch("/api/orders/ship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_ids: orderIds,
          tracking_number: tracking.trim(),
          shipping_date: shippingDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAssignResult(
        `Assigned tracking to ${data.shipped} order${data.shipped === 1 ? "" : "s"} · ${data.notified} notifications fired.`,
      );
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy && !preview) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (busy || preview) return;
        const f = e.dataTransfer.files?.[0];
        if (f) upload(f);
      }}
      style={{
        border: `2px dashed ${dragOver ? "#c4973a" : "#2d6b35"}`,
        borderRadius: 10,
        padding: 18,
        marginBottom: 20,
        backgroundColor: dragOver ? "#1a3d22" : "#0f2614",
        transition: "background-color 120ms, border-color 120ms",
      }}
    >
      {!preview && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 20,
                color: "#c4973a",
                margin: 0,
              }}
            >
              Mayo batch shipment
            </h2>
            <p
              style={{
                color: "#e8d5a3",
                fontSize: 12,
                marginTop: 4,
                marginBottom: 0,
              }}
            >
              Drop this shipment&apos;s Mayo batch sheet PDF here (the one
              you print + include in the FedEx box). Portal matches every
              patient row to a portal order, you enter the FedEx tracking
              number once, and every order in the batch gets stamped +
              notified in one shot.
            </p>
          </div>
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                backgroundColor: busy ? "#5a705f" : "#c4973a",
                color: "#0a1a0d",
                fontSize: 13,
                fontWeight: 700,
                border: 0,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Parsing…" : "Choose PDF"}
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <p
          style={{
            marginTop: preview ? 10 : 12,
            marginBottom: 0,
            fontSize: 12,
            color: "#e88b8b",
          }}
        >
          {errorMsg}
        </p>
      )}

      {preview && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  color: "#c4973a",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Batch {preview.batches.join(", ") || "unknown"}
              </div>
              <div style={{ color: "#ffffff", fontSize: 15, marginTop: 2 }}>
                {preview.matched} matched · {preview.unmatched} not found
                {preview.warnings.length > 0 && (
                  <span style={{ color: "#c4973a", marginLeft: 8, fontSize: 12 }}>
                    ⚠ {preview.warnings.join(" · ")}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={assigning}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #2d6b35",
                backgroundColor: "transparent",
                color: "#e8d5a3",
                fontSize: 12,
                fontWeight: 600,
                cursor: assigning ? "not-allowed" : "pointer",
              }}
            >
              Discard
            </button>
          </div>
          <div
            style={{
              maxHeight: 320,
              overflowY: "auto",
              border: "1px solid #2d6b35",
              borderRadius: 8,
              backgroundColor: "#0a1a0d",
              marginBottom: 12,
            }}
          >
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: "#1a3d22" }}>
                  <th style={th}>Order No.</th>
                  <th style={th}>Sheet Name</th>
                  <th style={th}>Portal Match</th>
                  <th style={th}>Total</th>
                  <th style={th}>Status</th>
                  <th style={th}>Existing tracking</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #1a3d22" }}>
                    <td style={{ ...td, fontFamily: "monospace" }}>
                      {r.order_no}
                    </td>
                    <td style={td}>{r.patient_name_on_sheet ?? "—"}</td>
                    <td style={td}>
                      {r.order_id ? (
                        <span>
                          <span style={{ color: "#8dc63f", fontWeight: 700 }}>
                            {r.portal_patient_name ?? "matched"}
                          </span>
                          {r.match_key && (
                            <span
                              style={{
                                color: "#8dc63f",
                                fontSize: 10,
                                marginLeft: 6,
                              }}
                            >
                              via {r.match_key.toUpperCase()}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "#e88b8b" }}>Not in portal</span>
                      )}
                    </td>
                    <td style={{ ...td, color: "#c4973a" }}>
                      {r.order_total_cad != null
                        ? `$${Number(r.order_total_cad).toFixed(2)}`
                        : "—"}
                    </td>
                    <td style={td}>{r.order_status ?? "—"}</td>
                    <td
                      style={{
                        ...td,
                        color: r.order_tracking_number ? "#e88b8b" : "#6ab04c",
                      }}
                    >
                      {r.order_tracking_number ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", fontSize: 10, color: "#8dc63f", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
              FedEx tracking number
              <input
                type="text"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="e.g. 874963817938"
                disabled={assigning}
                style={{
                  marginTop: 2,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #2d6b35",
                  backgroundColor: "#0a1a0d",
                  color: "#ffffff",
                  fontFamily: "monospace",
                  fontSize: 13,
                  width: 200,
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 10, color: "#8dc63f", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
              Shipping date
              <input
                type="date"
                value={shippingDate}
                onChange={(e) => setShippingDate(e.target.value)}
                disabled={assigning}
                style={{
                  marginTop: 2,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #2d6b35",
                  backgroundColor: "#0a1a0d",
                  color: "#ffffff",
                  fontSize: 13,
                  colorScheme: "dark",
                }}
              />
            </label>
            <button
              type="button"
              onClick={confirm}
              disabled={
                assigning ||
                !!assignResult ||
                preview.matched === 0 ||
                !tracking.trim()
              }
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                backgroundColor:
                  assigning ||
                  !!assignResult ||
                  preview.matched === 0 ||
                  !tracking.trim()
                    ? "#5a705f"
                    : "#c4973a",
                color: "#0a1a0d",
                fontSize: 13,
                fontWeight: 700,
                border: 0,
                cursor:
                  assigning ||
                  !!assignResult ||
                  preview.matched === 0 ||
                  !tracking.trim()
                    ? "not-allowed"
                    : "pointer",
                opacity: assignResult ? 0.6 : 1,
              }}
            >
              {assigning
                ? "Assigning…"
                : assignResult
                  ? "Tracking assigned"
                  : `Assign tracking to ${preview.matched} order${preview.matched === 1 ? "" : "s"} + notify`}
            </button>
          </div>
          {assignResult && (
            <p style={{ color: "#8dc63f", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
              {assignResult}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  color: "#c4973a",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
const td: React.CSSProperties = {
  padding: "6px 10px",
  color: "#e8d5a3",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
