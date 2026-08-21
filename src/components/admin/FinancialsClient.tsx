"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type {
  ShippedOrder,
  QboTxn,
} from "@/app/(admin)/admin/financials/page";

interface Props {
  orders: ShippedOrder[];
  qboTxns: QboTxn[];
  cogsCategories: string[];
  /** Earliest order in the system — chart / periods can't sensibly go
   *  before this. Populated server-side from min(orders.created_at). */
  earliestOrderISO: string | null;
}

// ─── Date helpers ─────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay() === 0 ? 7 : out.getDay();
  out.setDate(out.getDate() - (day - 1));
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Granularity = "weekly" | "monthly";

// ─── QBO period math ──────────────────────────────────────────────────

interface PeriodTotals {
  cogs: number;
  opex: number;
}

/**
 * Sum QBO transactions falling in [start, end). Refunds subtract.
 * `cogsSet` decides which categories count toward COGS vs OpEx;
 * uncategorized (null category) is bucketed as OpEx so it doesn't
 * silently disappear.
 */
function sumTxnsInPeriod(
  txns: QboTxn[],
  start: Date,
  end: Date,
  cogsSet: Set<string>,
): PeriodTotals {
  let cogs = 0;
  let opex = 0;
  const startISO = isoDate(start);
  const endISO = isoDate(end);
  for (const t of txns) {
    if (t.txn_date < startISO || t.txn_date >= endISO) continue;
    const signed = t.direction === "refund" ? -t.amount_cad : t.amount_cad;
    if (t.category && cogsSet.has(t.category)) cogs += signed;
    else opex += signed;
  }
  return { cogs, opex };
}

// ─── Main ─────────────────────────────────────────────────────────────

export function FinancialsClient({
  orders,
  qboTxns,
  cogsCategories,
  earliestOrderISO,
}: Props) {
  const cogsSet = useMemo(() => new Set(cogsCategories), [cogsCategories]);
  return (
    <OverviewTab
      orders={orders}
      qboTxns={qboTxns}
      cogsSet={cogsSet}
      earliestOrderISO={earliestOrderISO}
    />
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────

function OverviewTab({
  orders,
  qboTxns,
  cogsSet,
  earliestOrderISO,
}: {
  orders: ShippedOrder[];
  qboTxns: QboTxn[];
  cogsSet: Set<string>;
  earliestOrderISO: string | null;
}) {
  // Monthly is the useful default: "this week" starting Monday is
  // often 1–2 days old and reads $0.00 across the board even when
  // the business is fine. Monthly = current month, always meaningful.
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const { start, end, label } = useMemo(() => {
    if (customStart && customEnd) {
      return {
        start: new Date(`${customStart}T00:00:00`),
        end: new Date(`${customEnd}T23:59:59`),
        label: `${formatDateLong(customStart)} → ${formatDateLong(customEnd)}`,
      };
    }
    const now = new Date();
    if (granularity === "weekly") {
      const s = startOfWeek(now);
      const e = new Date(s);
      e.setDate(s.getDate() + 7);
      return {
        start: s,
        end: e,
        label: `Week of ${formatDateLong(isoDate(s))}`,
      };
    }
    const s = startOfMonth(now);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return {
      start: s,
      end: e,
      label: now.toLocaleDateString("en-CA", {
        month: "long",
        year: "numeric",
      }),
    };
  }, [granularity, customStart, customEnd]);

  const periodOrders = useMemo(
    () =>
      orders.filter((o) => {
        const t = new Date(o.revenue_date);
        return t >= start && t < end;
      }),
    [orders, start, end],
  );

  const revenue = periodOrders.reduce((s, o) => s + o.total_cad, 0);
  // Stripe processing fees for orders whose revenue_date falls in this
  // period. Treated as OpEx (payment processing expense), not netted
  // against revenue — standard accrual accounting practice.
  const stripeFees = periodOrders.reduce(
    (s, o) => s + (o.stripe_fee_cad ?? 0),
    0,
  );
  const totals = useMemo(
    () => sumTxnsInPeriod(qboTxns, start, end, cogsSet),
    [qboTxns, start, end, cogsSet],
  );
  const cogs = totals.cogs;
  const opex = totals.opex + stripeFees;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - opex;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : null;

  // 12-bucket chart series
  const series = useMemo(() => {
    const buckets: { start: Date; end: Date; label: string }[] = [];
    const now = new Date();
    const count = 12;
    if (granularity === "weekly") {
      const thisWeek = startOfWeek(now);
      for (let i = count - 1; i >= 0; i--) {
        const s = new Date(thisWeek);
        s.setDate(thisWeek.getDate() - i * 7);
        const e = new Date(s);
        e.setDate(s.getDate() + 7);
        buckets.push({
          start: s,
          end: e,
          label: `${s.getMonth() + 1}/${s.getDate()}`,
        });
      }
    } else {
      const first = startOfMonth(now);
      for (let i = count - 1; i >= 0; i--) {
        const s = new Date(
          first.getFullYear(),
          first.getMonth() - i,
          1,
        );
        const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
        buckets.push({
          start: s,
          end: e,
          label: s.toLocaleDateString("en-CA", { month: "short" }),
        });
      }
    }
    // Drop buckets ENTIRELY before the first real order in the system
    // — showing months of pre-portal QBO spending with $0 revenue makes
    // the chart look catastrophic when the business hadn't opened yet.
    const cutoff = earliestOrderISO
      ? new Date(`${earliestOrderISO}T00:00:00`)
      : null;
    const usable = cutoff
      ? buckets.filter((b) => b.end > cutoff)
      : buckets;

    return usable.map((b) => {
      const inBucket = orders.filter((o) => {
        const t = new Date(o.revenue_date);
        return t >= b.start && t < b.end;
      });
      const rev = inBucket.reduce((s, o) => s + o.total_cad, 0);
      const bStripe = inBucket.reduce(
        (s, o) => s + (o.stripe_fee_cad ?? 0),
        0,
      );
      const { cogs: bCogs, opex: bOpex } = sumTxnsInPeriod(
        qboTxns,
        b.start,
        b.end,
        cogsSet,
      );
      return {
        label: b.label,
        net: Math.round(rev - bCogs - bOpex - bStripe),
        // Bucket bounds for click-to-drilldown — Recharts passes the
        // data object to onClick handlers as payload.
        _startISO: isoDate(b.start),
        _endISO: isoDate(new Date(b.end.getTime() - 86400000)),
      };
    });
  }, [orders, qboTxns, granularity, cogsSet, earliestOrderISO]);

  const onChartBarClick = (data: unknown) => {
    if (typeof data !== "object" || data === null) return;
    const d = data as { _startISO?: string; _endISO?: string };
    if (d._startISO && d._endISO) {
      setCustomStart(d._startISO);
      setCustomEnd(d._endISO);
    }
  };

  return (
    <div className="space-y-6">
      {/* Period controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div
          className="flex rounded-lg border overflow-hidden"
          style={{ borderColor: "#2d6b35" }}
        >
          {(["weekly", "monthly"] as const).map((g) => {
            const active = granularity === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGranularity(g);
                  setCustomStart("");
                  setCustomEnd("");
                }}
                className="px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: active ? "#c4973a" : "transparent",
                  color: active ? "#0a1a0d" : "#e8d5a3",
                }}
              >
                {g === "weekly" ? "Weekly" : "Monthly"}
              </button>
            );
          })}
        </div>
        <div className="flex items-end gap-2">
          <Field label="Custom start">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="mf-input"
              style={{ colorScheme: "dark" }}
            />
          </Field>
          <Field label="Custom end">
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="mf-input"
              style={{ colorScheme: "dark" }}
            />
          </Field>
          {(customStart || customEnd) && (
            <button
              type="button"
              onClick={() => {
                setCustomStart("");
                setCustomEnd("");
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold border"
              style={{
                backgroundColor: "transparent",
                borderColor: "#2d6b35",
                color: "#e8d5a3",
              }}
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs ml-auto" style={{ color: "#6ab04c" }}>
          Showing: {label}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card label="Total Revenue" value={formatCurrency(revenue)} />
        <Card label="COGS (real, QBO)" value={formatCurrency(cogs)} />
        <Card
          label="Gross Profit"
          value={formatCurrency(grossProfit)}
          accent
        />
        <Card
          label={
            stripeFees > 0
              ? `Operating Expenses (QBO + Stripe ${formatCurrency(stripeFees)})`
              : "Operating Expenses (QBO)"
          }
          value={formatCurrency(opex)}
        />
        <Card
          label="Net Profit"
          value={formatCurrency(netProfit)}
          accent
        />
        <Card
          label="Net Margin"
          value={netMargin == null ? "—" : `${netMargin.toFixed(1)}%`}
          accent
        />
      </div>

      {/* Chart */}
      <div
        className="rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h3
          className="font-heading text-lg font-semibold mb-4"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Net profit — last 12{" "}
          {granularity === "weekly" ? "weeks" : "months"}
        </h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart
              data={series}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="#2d6b35"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="#e8d5a3"
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke="#e8d5a3" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f2614",
                  border: "1px solid #2d6b35",
                  borderRadius: 8,
                  color: "#ffffff",
                }}
                formatter={(v) => [
                  formatCurrency(Number(v) || 0),
                  "Net profit",
                ]}
              />
              <Bar
                dataKey="net"
                fill="#c4973a"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={onChartBarClick}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p style={{ color: "#8dc63f", fontSize: 11, marginTop: 6, marginBottom: 0 }}>
          Click any bar to drill into that period&apos;s P&amp;L below.
        </p>
      </div>

      <PnLBreakdown
        orders={periodOrders}
        qboTxns={qboTxns}
        cogsSet={cogsSet}
        start={start}
        end={end}
        periodLabel={label}
      />
    </div>
  );
}

// ─── P&L DRILLDOWN ────────────────────────────────────────────────────

function PnLBreakdown({
  orders,
  qboTxns,
  cogsSet,
  start,
  end,
  periodLabel,
}: {
  orders: ShippedOrder[];
  qboTxns: QboTxn[];
  cogsSet: Set<string>;
  start: Date;
  end: Date;
  periodLabel: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const startISO = isoDate(start);
  const endISO = isoDate(end);

  // Revenue side (already filtered to period)
  const revenue = orders.reduce((s, o) => s + o.total_cad, 0);
  const stripeFees = orders.reduce(
    (s, o) => s + (o.stripe_fee_cad ?? 0),
    0,
  );

  // QBO transactions in the window
  const periodTxns = qboTxns.filter(
    (t) => t.txn_date >= startISO && t.txn_date < endISO,
  );

  // Bucket by category, keeping COGS vs OpEx separation
  const cogsBuckets = new Map<string, QboTxn[]>();
  const opexBuckets = new Map<string, QboTxn[]>();
  for (const t of periodTxns) {
    const bucketKey = t.category ?? "uncategorized";
    const bucket =
      t.category && cogsSet.has(t.category) ? cogsBuckets : opexBuckets;
    const arr = bucket.get(bucketKey) ?? [];
    arr.push(t);
    bucket.set(bucketKey, arr);
  }

  const bucketSum = (txns: QboTxn[]) =>
    txns.reduce(
      (s, t) => s + (t.direction === "refund" ? -t.amount_cad : t.amount_cad),
      0,
    );

  const cogsRows = [...cogsBuckets.entries()]
    .map(([category, txns]) => ({
      category,
      txns,
      amount: bucketSum(txns),
    }))
    .sort((a, b) => b.amount - a.amount);
  const opexRows = [...opexBuckets.entries()]
    .map(([category, txns]) => ({
      category,
      txns,
      amount: bucketSum(txns),
    }))
    .sort((a, b) => b.amount - a.amount);

  const cogsTotal = cogsRows.reduce((s, r) => s + r.amount, 0);
  const opexTotal = opexRows.reduce((s, r) => s + r.amount, 0) + stripeFees;
  const grossProfit = revenue - cogsTotal;
  const netProfit = grossProfit - opexTotal;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      style={{
        marginTop: 24,
        border: "1px solid #2d6b35",
        borderRadius: 12,
        backgroundColor: "#0f2614",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid #2d6b35",
          backgroundColor: "#1a3d22",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
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
            P&amp;L Breakdown
          </div>
          <div
            style={{
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {periodLabel}
          </div>
        </div>
        <div
          style={{
            color: netProfit >= 0 ? "#8dc63f" : "#e88b8b",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {formatCurrency(netProfit)}
        </div>
      </div>
      <table style={{ width: "100%", fontSize: 13 }}>
        <tbody>
          {/* REVENUE */}
          <PnLSectionRow label="Revenue (pre-tax)" amount={revenue} accent />

          {/* COGS */}
          <PnLBreak />
          <PnLHeader label="COGS" total={cogsTotal} />
          {cogsRows.length === 0 && (
            <PnLEmpty label="No COGS transactions in this period." />
          )}
          {cogsRows.map((r) => (
            <PnLCategoryRow
              key={r.category}
              row={r}
              expanded={expanded.has(`cogs:${r.category}`)}
              onToggle={() => toggle(`cogs:${r.category}`)}
            />
          ))}

          {/* GROSS PROFIT */}
          <PnLBreak />
          <PnLSectionRow
            label="Gross Profit"
            amount={grossProfit}
            secondary={
              revenue > 0
                ? `${((grossProfit / revenue) * 100).toFixed(1)}% margin`
                : undefined
            }
          />

          {/* OPEX */}
          <PnLBreak />
          <PnLHeader label="Operating Expenses" total={opexTotal} />
          {opexRows.length === 0 && stripeFees === 0 && (
            <PnLEmpty label="No operating expenses in this period." />
          )}
          {opexRows.map((r) => (
            <PnLCategoryRow
              key={r.category}
              row={r}
              expanded={expanded.has(`opex:${r.category}`)}
              onToggle={() => toggle(`opex:${r.category}`)}
            />
          ))}
          {stripeFees > 0 && (
            <tr>
              <td style={pnlCell}>Payment processing (Stripe)</td>
              <td style={pnlCellR}>{orders.filter((o) => o.stripe_fee_cad).length} orders</td>
              <td style={{ ...pnlCellR, color: "#e8d5a3" }}>
                {formatCurrency(stripeFees)}
              </td>
            </tr>
          )}

          {/* NET PROFIT */}
          <PnLBreak />
          <PnLSectionRow
            label="Net Profit"
            amount={netProfit}
            accent
            secondary={
              revenue > 0
                ? `${((netProfit / revenue) * 100).toFixed(1)}% net margin`
                : undefined
            }
          />
        </tbody>
      </table>
    </div>
  );
}

const pnlCell: React.CSSProperties = {
  padding: "8px 18px",
  color: "#e8d5a3",
  borderTop: "1px solid #1a3d22",
};
const pnlCellR: React.CSSProperties = {
  ...pnlCell,
  textAlign: "right",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};

function PnLBreak() {
  return (
    <tr>
      <td colSpan={3} style={{ height: 6, backgroundColor: "#0a1a0d" }} />
    </tr>
  );
}
function PnLEmpty({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={3}
        style={{ ...pnlCell, color: "#6ab04c", fontStyle: "italic" }}
      >
        {label}
      </td>
    </tr>
  );
}
function PnLHeader({ label, total }: { label: string; total: number }) {
  return (
    <tr style={{ backgroundColor: "#1a3d22" }}>
      <td
        style={{
          ...pnlCell,
          color: "#c4973a",
          fontWeight: 700,
          textTransform: "uppercase",
          fontSize: 11,
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </td>
      <td style={pnlCell}></td>
      <td
        style={{
          ...pnlCellR,
          color: "#c4973a",
          fontWeight: 700,
        }}
      >
        {formatCurrency(total)}
      </td>
    </tr>
  );
}
function PnLSectionRow({
  label,
  amount,
  accent,
  secondary,
}: {
  label: string;
  amount: number;
  accent?: boolean;
  secondary?: string;
}) {
  return (
    <tr style={{ backgroundColor: accent ? "#1a3d22" : undefined }}>
      <td
        style={{
          ...pnlCell,
          color: "#ffffff",
          fontWeight: 700,
          fontSize: accent ? 15 : 13,
        }}
      >
        {label}
      </td>
      <td style={{ ...pnlCellR, color: "#8dc63f" }}>{secondary ?? ""}</td>
      <td
        style={{
          ...pnlCellR,
          color: accent
            ? amount >= 0
              ? "#8dc63f"
              : "#e88b8b"
            : "#ffffff",
          fontWeight: 700,
          fontSize: accent ? 15 : 13,
        }}
      >
        {formatCurrency(amount)}
      </td>
    </tr>
  );
}
function PnLCategoryRow({
  row,
  expanded,
  onToggle,
}: {
  row: { category: string; txns: QboTxn[]; amount: number };
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: "pointer" }}
      >
        <td style={pnlCell}>
          <span style={{ color: "#c4973a", marginRight: 6 }}>
            {expanded ? "▾" : "▸"}
          </span>
          {formatCategoryLabel(row.category)}
        </td>
        <td style={{ ...pnlCellR, color: "#8dc63f" }}>
          {row.txns.length} txn{row.txns.length === 1 ? "" : "s"}
        </td>
        <td style={{ ...pnlCellR, color: "#ffffff" }}>
          {formatCurrency(row.amount)}
        </td>
      </tr>
      {expanded &&
        row.txns
          .slice()
          .sort((a, b) => b.amount_cad - a.amount_cad)
          .map((t, i) => (
            <tr key={i} style={{ backgroundColor: "#0a1a0d" }}>
              <td
                style={{
                  ...pnlCell,
                  paddingLeft: 42,
                  color: "#e8d5a3",
                  fontSize: 12,
                }}
              >
                {t.supplier_name ?? "(no supplier)"} · {t.txn_date}
              </td>
              <td style={{ ...pnlCellR, color: "#6ab04c" }}>
                {t.direction === "refund" ? "refund" : ""}
              </td>
              <td
                style={{
                  ...pnlCellR,
                  color: t.direction === "refund" ? "#8dc63f" : "#e8d5a3",
                }}
              >
                {formatCurrency(
                  t.direction === "refund" ? -t.amount_cad : t.amount_cad,
                )}
              </td>
            </tr>
          ))}
    </>
  );
}
function formatCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    cogs_lab: "Lab — outside processors (Mayo, Armin, etc.)",
    cogs_shipping: "Shipping (FedEx)",
    cogs_supplies: "Medical supplies (dry ice, tubes, etc.)",
    contractor: "Contractor (FloLabs)",
    saas: "SaaS / software",
    marketing: "Marketing",
    regulatory: "Regulatory / professional",
    bank_fees: "Bank fees",
    travel: "Travel",
    inventory: "Inventory (supplements resale)",
    other: "Other",
    uncategorized: "Uncategorized",
  };
  return map[cat] ?? cat;
}


// ─── Small reusable bits ──────────────────────────────────────────────

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <p
        className="text-xs uppercase tracking-wider mb-1"
        style={{ color: "#6ab04c" }}
      >
        {label}
      </p>
      <p
        className="font-semibold"
        style={{
          color: accent ? "#c4973a" : "#ffffff",
          fontSize: "22px",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "#e8d5a3" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
