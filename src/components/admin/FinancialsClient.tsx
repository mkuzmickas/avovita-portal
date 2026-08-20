"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
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
  ManifestSummary,
  QboTxn,
} from "@/app/(admin)/admin/financials/page";

interface Props {
  orders: ShippedOrder[];
  manifests: ManifestSummary[];
  qboTxns: QboTxn[];
  cogsCategories: string[];
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
  manifests,
  qboTxns,
  cogsCategories,
}: Props) {
  const [tab, setTab] = useState<"overview" | "shipment">("overview");
  const cogsSet = useMemo(() => new Set(cogsCategories), [cogsCategories]);

  return (
    <div className="space-y-6">
      <div
        className="flex items-center gap-2 border-b"
        style={{ borderColor: "#2d6b35" }}
      >
        {(
          [
            ["overview", "Overview"],
            ["shipment", "By Shipment"],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="px-4 py-2.5 text-sm font-semibold transition-colors"
              style={{
                color: active ? "#c4973a" : "#e8d5a3",
                borderBottom: active
                  ? "2px solid #c4973a"
                  : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab
          orders={orders}
          qboTxns={qboTxns}
          cogsSet={cogsSet}
        />
      )}
      {tab === "shipment" && (
        <ByShipmentTab
          manifests={manifests}
          qboTxns={qboTxns}
          cogsSet={cogsSet}
        />
      )}
    </div>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────

function OverviewTab({
  orders,
  qboTxns,
  cogsSet,
}: {
  orders: ShippedOrder[];
  qboTxns: QboTxn[];
  cogsSet: Set<string>;
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
  const totals = useMemo(
    () => sumTxnsInPeriod(qboTxns, start, end, cogsSet),
    [qboTxns, start, end, cogsSet],
  );
  const cogs = totals.cogs;
  const opex = totals.opex;
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
    return buckets.map((b) => {
      const inBucket = orders.filter((o) => {
        const t = new Date(o.revenue_date);
        return t >= b.start && t < b.end;
      });
      const rev = inBucket.reduce((s, o) => s + o.total_cad, 0);
      const { cogs: bCogs, opex: bOpex } = sumTxnsInPeriod(
        qboTxns,
        b.start,
        b.end,
        cogsSet,
      );
      return {
        label: b.label,
        net: Math.round(rev - bCogs - bOpex),
      };
    });
  }, [orders, qboTxns, granularity, cogsSet]);

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
          label="Operating Expenses (QBO)"
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
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── BY SHIPMENT TAB ──────────────────────────────────────────────────

function ByShipmentTab({
  manifests,
  qboTxns,
  cogsSet,
}: {
  manifests: ManifestSummary[];
  qboTxns: QboTxn[];
  cogsSet: Set<string>;
}) {
  // Pro-rate OpEx by week using the trailing 12 weeks of QBO OpEx.
  // (COGS is transactional — attributed to the ship week directly.)
  const weeklyOpex = useMemo(() => {
    const now = new Date();
    const twelveWeeksAgo = new Date(now);
    twelveWeeksAgo.setDate(now.getDate() - 12 * 7);
    const { opex } = sumTxnsInPeriod(qboTxns, twelveWeeksAgo, now, cogsSet);
    return opex / 12;
  }, [qboTxns, cogsSet]);

  const rows = useMemo(
    () =>
      manifests.map((m) => {
        const ship = new Date(`${m.ship_date}T00:00:00`);
        const weekStart = startOfWeek(ship);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        const { cogs: weekCogs } = sumTxnsInPeriod(
          qboTxns,
          weekStart,
          weekEnd,
          cogsSet,
        );
        // If multiple manifests ship the same week, split the week's
        // COGS across them. Simple even split — accurate enough for
        // steady weekly shipments; refine per-supplier later.
        const manifestsThisWeek = manifests.filter((m2) => {
          const s = new Date(`${m2.ship_date}T00:00:00`);
          return s >= weekStart && s < weekEnd;
        }).length;
        const cogsShare = manifestsThisWeek > 0
          ? weekCogs / manifestsThisWeek
          : weekCogs;
        const grossProfit = m.revenue - cogsShare;
        const opExShare =
          manifestsThisWeek > 0 ? weeklyOpex / manifestsThisWeek : weeklyOpex;
        const netProfit = grossProfit - opExShare;
        const margin =
          m.revenue > 0 ? (netProfit / m.revenue) * 100 : null;
        return {
          ...m,
          cogs: cogsShare,
          grossProfit,
          opEx: opExShare,
          netProfit,
          margin,
        };
      }),
    [manifests, qboTxns, cogsSet, weeklyOpex],
  );

  const exportCsv = () => {
    const header = [
      "Ship Date",
      "Manifest Name",
      "Orders",
      "Tests",
      "Revenue CAD",
      "COGS CAD (allocated from ship week)",
      "Gross Profit CAD",
      "OpEx CAD (weekly average)",
      "Net Profit CAD",
      "Margin %",
    ];
    const lines = rows.map((r) => [
      r.ship_date,
      r.name,
      String(r.orders_count),
      String(r.tests_count),
      r.revenue.toFixed(2),
      r.cogs.toFixed(2),
      r.grossProfit.toFixed(2),
      r.opEx.toFixed(2),
      r.netProfit.toFixed(2),
      r.margin == null ? "" : r.margin.toFixed(1),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financials-by-shipment-${isoDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs" style={{ color: "#6ab04c" }}>
          COGS allocated from QBO transactions in the manifest&apos;s ship week;
          OpEx pro-rated from trailing 12-week average (${(weeklyOpex).toFixed(0)}/wk).
        </p>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
          style={{
            backgroundColor: "transparent",
            borderColor: "#c4973a",
            color: "#c4973a",
            opacity: rows.length === 0 ? 0.5 : 1,
          }}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {[
                  "Ship Date",
                  "Manifest",
                  "Orders",
                  "Tests",
                  "Revenue",
                  "COGS",
                  "Gross Profit",
                  "OpEx (week)",
                  "Net Profit",
                  "Margin",
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
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-16 text-center"
                    style={{
                      backgroundColor: "#0a1a0d",
                      color: "#6ab04c",
                    }}
                  >
                    No manifests yet
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const marginColor =
                    r.margin == null
                      ? "#6ab04c"
                      : r.margin >= 50
                        ? "#8dc63f"
                        : r.margin >= 25
                          ? "#c4973a"
                          : "#e05252";
                  return (
                    <tr
                      key={r.id}
                      style={{
                        backgroundColor: rowBg,
                        borderTop: "1px solid #1a3d22",
                      }}
                    >
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "#ffffff" }}
                      >
                        {formatDateLong(r.ship_date)}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#e8d5a3" }}>
                        {r.name}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#e8d5a3" }}>
                        {r.orders_count}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#e8d5a3" }}>
                        {r.tests_count}
                      </td>
                      <td
                        className="px-4 py-3 font-semibold whitespace-nowrap"
                        style={{ color: "#c4973a" }}
                      >
                        {formatCurrency(r.revenue)}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {formatCurrency(r.cogs)}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "#ffffff" }}
                      >
                        {formatCurrency(r.grossProfit)}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {formatCurrency(r.opEx)}
                      </td>
                      <td
                        className="px-4 py-3 font-semibold whitespace-nowrap"
                        style={{
                          color: r.netProfit >= 0 ? "#8dc63f" : "#e05252",
                        }}
                      >
                        {formatCurrency(r.netProfit)}
                      </td>
                      <td
                        className="px-4 py-3 font-semibold whitespace-nowrap"
                        style={{ color: marginColor }}
                      >
                        {r.margin == null ? "—" : `${r.margin.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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

function escapeCsv(value: string): string {
  if (value == null) return "";
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
