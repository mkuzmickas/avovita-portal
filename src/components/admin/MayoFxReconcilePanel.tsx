"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Panel on /admin/mayo/invoices/[id] that compares our CAD estimate
 * for a Mayo invoice (total_usd × fx_rate) against the actual AMEX
 * CAD payments pulled from QBO. Shows the implied actual fx and a
 * one-click button to pin the invoice's fx_rate to that value so the
 * P&L retroactively matches penny-for-penny.
 *
 * All numbers are server-computed and passed in — this component is
 * presentation + the fx_rate update POST.
 */
export interface MayoFxReconcilePanelProps {
  invoiceId: string;
  invoiceDate: string;
  totalUsd: number;
  currentFxRate: number;
  estimatedCad: number;
  /** AMEX payments assigned to this invoice (between invoice date and
   *  the next-later invoice date). */
  payments: Array<{ txn_date: string; amount_cad: number }>;
  /** Date of the invoice immediately after this one, used to bound the
   *  payment window. null when this is the latest invoice (window
   *  extends to "today"). */
  nextInvoiceDate: string | null;
}

export function MayoFxReconcilePanel({
  invoiceId,
  invoiceDate,
  totalUsd,
  currentFxRate,
  estimatedCad,
  payments,
  nextInvoiceDate,
}: MayoFxReconcilePanelProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paidCad = payments.reduce((s, p) => s + Number(p.amount_cad), 0);
  const impliedFx = paidCad > 0 ? paidCad / totalUsd : null;
  const variance = paidCad > 0 ? estimatedCad - paidCad : null;
  const variancePct =
    variance !== null && paidCad > 0 ? (variance / paidCad) * 100 : null;

  async function applyImpliedFx() {
    if (impliedFx === null) return;
    const rounded = Number(impliedFx.toFixed(4));
    const confirmMsg =
      `Set this invoice's fx_rate to ${rounded}?\n\n` +
      `Current: ${currentFxRate.toFixed(4)}  →  New: ${rounded}\n\n` +
      `This changes the CAD figure for this invoice everywhere ` +
      `(matcher, P&L chart, drilldown) to match what you actually paid.`;
    if (!window.confirm(confirmMsg)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/mayo/invoices/${invoiceId}/fx-rate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fx_rate: rounded }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = { color: "#8dc63f", fontSize: 11 };
  const valueStyle = {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
  };

  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2
            className="font-heading text-lg font-semibold"
            style={{ color: "#c4973a" }}
          >
            AMEX reconciliation
          </h2>
          <p className="mt-1" style={{ color: "#e8d5a3", fontSize: 12 }}>
            Compares our fx-based CAD estimate against the actual AMEX
            payments from QBO. Window: payments dated after{" "}
            {formatDate(invoiceDate)}
            {nextInvoiceDate
              ? ` and on or before ${formatDate(nextInvoiceDate)}`
              : " (no later invoice yet, so window extends to today)"}
            .
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Stat
          label="USD billed"
          value={formatUsd(totalUsd)}
          labelStyle={labelStyle}
          valueStyle={valueStyle}
        />
        <Stat
          label={`CAD estimate @ ${currentFxRate.toFixed(4)}`}
          value={formatCad(estimatedCad)}
          labelStyle={labelStyle}
          valueStyle={valueStyle}
        />
        <Stat
          label={
            payments.length > 0
              ? `AMEX paid CAD · ${payments.length} hit${payments.length === 1 ? "" : "s"}`
              : "AMEX paid CAD"
          }
          value={paidCad > 0 ? formatCad(paidCad) : "— (no sync yet)"}
          labelStyle={labelStyle}
          valueStyle={valueStyle}
        />
        <Stat
          label="Implied actual fx"
          value={impliedFx !== null ? impliedFx.toFixed(4) : "—"}
          labelStyle={labelStyle}
          valueStyle={{
            ...valueStyle,
            color: impliedFx !== null ? "#c4973a" : "#e8d5a3",
          }}
        />
      </div>

      {payments.length > 0 && (
        <div
          className="rounded-lg border p-3 mb-4"
          style={{ borderColor: "#2d6b35", backgroundColor: "#0f2614" }}
        >
          <p
            className="uppercase tracking-wider mb-2"
            style={{ color: "#8dc63f", fontSize: 10, fontWeight: 600 }}
          >
            Payment hits in window
          </p>
          <ul className="space-y-1">
            {payments.map((p, i) => (
              <li
                key={`${p.txn_date}-${i}`}
                className="flex items-center justify-between"
                style={{ color: "#e8d5a3", fontSize: 13 }}
              >
                <span>{formatDate(p.txn_date)}</span>
                <span style={{ color: "#ffffff", fontWeight: 600 }}>
                  {formatCad(Number(p.amount_cad))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {variance !== null && (
        <div
          className="rounded-lg px-3 py-2 mb-4"
          style={{
            backgroundColor:
              Math.abs(variance) < 50
                ? "rgba(141,198,63,0.1)"
                : "rgba(196,151,58,0.1)",
            borderLeft: `3px solid ${Math.abs(variance) < 50 ? "#8dc63f" : "#c4973a"}`,
          }}
        >
          <p style={{ color: "#e8d5a3", fontSize: 13 }}>
            <span style={{ color: "#ffffff", fontWeight: 600 }}>Variance:</span>{" "}
            P&L {variance > 0 ? "overstates" : "understates"} this invoice's
            Mayo COGS by{" "}
            <span style={{ color: "#c4973a", fontWeight: 600 }}>
              {formatCad(Math.abs(variance))}
            </span>
            {variancePct !== null &&
              ` (${variancePct > 0 ? "+" : ""}${variancePct.toFixed(2)}%)`}
            .
          </p>
        </div>
      )}

      {error && (
        <p
          className="mb-3"
          style={{ color: "#e05252", fontSize: 13, fontWeight: 600 }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={applyImpliedFx}
          disabled={impliedFx === null || saving}
          className="mf-btn-primary px-4 py-2 text-sm"
          style={{
            opacity: impliedFx === null || saving ? 0.5 : 1,
            cursor: impliedFx === null || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving
            ? "Saving…"
            : impliedFx !== null
              ? `Set fx_rate to ${impliedFx.toFixed(4)}`
              : "Awaiting AMEX sync"}
        </button>
        {impliedFx !== null && (
          <span style={{ color: "#8dc63f", fontSize: 11 }}>
            Retroactively updates every CAD figure derived from this invoice.
          </span>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  labelStyle,
  valueStyle,
}: {
  label: string;
  value: string;
  labelStyle: React.CSSProperties;
  valueStyle: React.CSSProperties;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "#2d6b35", backgroundColor: "#0f2614" }}
    >
      <p
        className="uppercase tracking-wider mb-1"
        style={{ ...labelStyle, fontWeight: 600 }}
      >
        {label}
      </p>
      <p style={valueStyle}>{value}</p>
    </div>
  );
}

function formatCad(n: number): string {
  return n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
