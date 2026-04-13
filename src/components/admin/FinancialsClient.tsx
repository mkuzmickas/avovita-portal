"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  Download,
  AlertCircle,
} from "lucide-react";
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
  Expense,
  ExpenseCategory,
  ExpenseFrequency,
} from "@/types/database";
import type {
  ShippedOrder,
  ManifestSummary,
} from "@/app/(admin)/admin/financials/page";

interface Props {
  orders: ShippedOrder[];
  manifests: ManifestSummary[];
  initialExpenses: Expense[];
}

const CATEGORIES: ExpenseCategory[] = [
  "software",
  "utilities",
  "supplies",
  "labour",
  "shipping",
  "marketing",
  "other",
];
const FREQUENCIES: ExpenseFrequency[] = ["monthly", "annual", "one_time"];

const WEEKS_PER_MONTH = 4.33;
const DAYS_PER_MONTH = 30.44;

// Convert any expense to a monthly equivalent. one_time → 0 (excluded
// from recurring operating expense pro-rate).
function monthlyEquivalent(amount: number, frequency: ExpenseFrequency): number {
  if (frequency === "monthly") return amount;
  if (frequency === "annual") return amount / 12;
  return 0;
}

function totalMonthlyRecurring(expenses: Expense[]): number {
  return expenses
    .filter((e) => e.active)
    .reduce((s, e) => s + monthlyEquivalent(e.amount_cad, e.frequency), 0);
}

function expensesForDays(monthlyTotal: number, days: number): number {
  return monthlyTotal * (days / DAYS_PER_MONTH);
}

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

export function FinancialsClient({ orders, manifests, initialExpenses }: Props) {
  const [tab, setTab] = useState<"overview" | "shipment" | "expenses">("overview");
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);

  const monthlyExpenseTotal = useMemo(
    () => totalMonthlyRecurring(expenses),
    [expenses]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b" style={{ borderColor: "#2d6b35" }}>
        {(
          [
            ["overview", "Overview"],
            ["shipment", "By Shipment"],
            ["expenses", "Expenses"],
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
                borderBottom: active ? "2px solid #c4973a" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab orders={orders} monthlyExpenseTotal={monthlyExpenseTotal} />
      )}
      {tab === "shipment" && (
        <ByShipmentTab manifests={manifests} monthlyExpenseTotal={monthlyExpenseTotal} />
      )}
      {tab === "expenses" && (
        <ExpensesTab expenses={expenses} setExpenses={setExpenses} />
      )}
    </div>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────

function OverviewTab({
  orders,
  monthlyExpenseTotal,
}: {
  orders: ShippedOrder[];
  monthlyExpenseTotal: number;
}) {
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // Determine the active card period
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
      label: now.toLocaleDateString("en-CA", { month: "long", year: "numeric" }),
    };
  }, [granularity, customStart, customEnd]);

  const periodOrders = useMemo(
    () =>
      orders.filter((o) => {
        const t = new Date(o.shipped_at);
        return t >= start && t < end;
      }),
    [orders, start, end]
  );

  const revenue = periodOrders.reduce((s, o) => s + o.total_cad, 0);
  const testCost = periodOrders.reduce((s, o) => s + o.test_cost_cad, 0);
  const grossProfit = revenue - testCost;
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  );
  const opEx = expensesForDays(monthlyExpenseTotal, days);
  const netProfit = grossProfit - opEx;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : null;

  // Chart series — last 12 buckets at the selected granularity
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
        const s = new Date(first.getFullYear(), first.getMonth() - i, 1);
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
        const t = new Date(o.shipped_at);
        return t >= b.start && t < b.end;
      });
      const rev = inBucket.reduce((s, o) => s + o.total_cad, 0);
      const cost = inBucket.reduce((s, o) => s + o.test_cost_cad, 0);
      const bDays = (b.end.getTime() - b.start.getTime()) / (24 * 60 * 60 * 1000);
      const bOpEx = expensesForDays(monthlyExpenseTotal, bDays);
      return {
        label: b.label,
        net: Math.round(rev - cost - bOpEx),
      };
    });
  }, [orders, granularity, monthlyExpenseTotal]);

  return (
    <div className="space-y-6">
      {/* Period controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#2d6b35" }}>
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
        <Card label="Test Costs" value={formatCurrency(testCost)} />
        <Card label="Gross Profit" value={formatCurrency(grossProfit)} accent />
        <Card label="Operating Expenses" value={formatCurrency(opEx)} />
        <Card label="Net Profit" value={formatCurrency(netProfit)} accent />
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
          Net profit — last 12 {granularity === "weekly" ? "weeks" : "months"}
        </h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#2d6b35" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#e8d5a3" tick={{ fontSize: 11 }} />
              <YAxis stroke="#e8d5a3" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f2614",
                  border: "1px solid #2d6b35",
                  borderRadius: 8,
                  color: "#ffffff",
                }}
                formatter={(v) => [formatCurrency(Number(v) || 0), "Net profit"]}
              />
              <Bar dataKey="net" fill="#c4973a" radius={[4, 4, 0, 0]} />
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
  monthlyExpenseTotal,
}: {
  manifests: ManifestSummary[];
  monthlyExpenseTotal: number;
}) {
  // Pro-rate: each manifest = 1 week of operating expenses
  const weeklyExpense = monthlyExpenseTotal / WEEKS_PER_MONTH;

  const rows = manifests.map((m) => {
    const grossProfit = m.revenue - m.test_cost;
    const netProfit = grossProfit - weeklyExpense;
    const margin = m.revenue > 0 ? (netProfit / m.revenue) * 100 : null;
    return { ...m, grossProfit, opEx: weeklyExpense, netProfit, margin };
  });

  const exportCsv = () => {
    const header = [
      "Ship Date",
      "Manifest Name",
      "Orders",
      "Tests",
      "Revenue CAD",
      "Test Cost CAD",
      "Gross Profit CAD",
      "Operating Expenses CAD",
      "Net Profit CAD",
      "Margin %",
    ];
    const lines = rows.map((r) => [
      r.ship_date,
      r.name,
      String(r.orders_count),
      String(r.tests_count),
      r.revenue.toFixed(2),
      r.test_cost.toFixed(2),
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
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "#6ab04c" }}>
          Operating expenses pro-rated weekly (monthly ÷ 4.33)
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
                  "Test Cost",
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
                    style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
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
                        {formatCurrency(r.test_cost)}
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
                        style={{ color: r.netProfit >= 0 ? "#8dc63f" : "#e05252" }}
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

// ─── EXPENSES TAB ─────────────────────────────────────────────────────

function ExpensesTab({
  expenses,
  setExpenses,
}: {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const monthlyTotal = totalMonthlyRecurring(expenses);
  const annualTotal = monthlyTotal * 12;

  const removeExpense = async (id: string) => {
    if (!confirm("Delete this expense permanently?")) return;
    const res = await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed: ${data.error ?? res.statusText}`);
      return;
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const toggleActive = async (id: string, next: boolean) => {
    const res = await fetch(`/api/admin/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed: ${data.error ?? res.statusText}`);
      return;
    }
    setExpenses((prev) =>
      prev.map((e) => (e.id === id ? { ...e, active: next } : e))
    );
  };

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <Card label="Total Monthly Recurring" value={formatCurrency(monthlyTotal)} accent />
        <Card label="Annual Operating Cost" value={formatCurrency(annualTotal)} accent />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <Plus className="w-4 h-4" />
          {creating ? "Cancel" : "Add Expense"}
        </button>
      </div>

      {creating && (
        <ExpenseForm
          mode="create"
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {[
                  "Name",
                  "Category",
                  "Frequency",
                  "Amount",
                  "Monthly Equiv.",
                  "Active",
                  "",
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
              {expenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-16 text-center"
                    style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
                  >
                    No expenses yet — add your first to start tracking operating costs.
                  </td>
                </tr>
              ) : (
                expenses.flatMap((e, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const monthly = monthlyEquivalent(e.amount_cad, e.frequency);
                  const isEditing = editingId === e.id;
                  const display = (
                    <tr
                      key={e.id}
                      style={{
                        backgroundColor: rowBg,
                        borderTop: "1px solid #1a3d22",
                      }}
                    >
                      <td className="px-4 py-3" style={{ color: "#ffffff" }}>
                        {e.name}
                        {e.notes && (
                          <p className="text-xs italic mt-0.5" style={{ color: "#6ab04c" }}>
                            {e.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize" style={{ color: "#e8d5a3" }}>
                        {e.category}
                      </td>
                      <td className="px-4 py-3 capitalize" style={{ color: "#e8d5a3" }}>
                        {e.frequency.replace("_", " ")}
                      </td>
                      <td
                        className="px-4 py-3 font-semibold whitespace-nowrap"
                        style={{ color: "#c4973a" }}
                      >
                        {formatCurrency(e.amount_cad)}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {e.frequency === "one_time" ? "—" : formatCurrency(monthly)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={e.active}
                          onChange={(ev) => toggleActive(e.id, ev.target.checked)}
                          style={{ accentColor: "#c4973a" }}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(isEditing ? null : e.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold border"
                            style={{
                              backgroundColor: "transparent",
                              borderColor: "#2d6b35",
                              color: "#e8d5a3",
                            }}
                          >
                            {isEditing ? "Close" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeExpense(e.id)}
                            className="px-2 py-1 rounded-lg text-xs"
                            style={{
                              backgroundColor: "transparent",
                              color: "#e05252",
                            }}
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  if (!isEditing) return [display];
                  return [
                    display,
                    <tr key={`${e.id}-edit`} style={{ backgroundColor: rowBg }}>
                      <td colSpan={7} className="p-0">
                        <div
                          className="px-4 py-4 border-t"
                          style={{
                            borderColor: "#2d6b35",
                            backgroundColor: "#0f2614",
                          }}
                        >
                          <ExpenseForm
                            mode="edit"
                            initial={e}
                            onCancel={() => setEditingId(null)}
                            onSaved={(updated) => {
                              setEditingId(null);
                              if (updated) {
                                setExpenses((prev) =>
                                  prev.map((x) =>
                                    x.id === e.id ? { ...x, ...updated } : x
                                  )
                                );
                              }
                            }}
                          />
                        </div>
                      </td>
                    </tr>,
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Expense create/edit form ─────────────────────────────────────────

function ExpenseForm({
  mode,
  initial,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: Expense;
  onCancel: () => void;
  onSaved: (updated?: Partial<Expense>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(
    initial ? String(initial.amount_cad) : ""
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    initial?.category ?? "software"
  );
  const [frequency, setFrequency] = useState<ExpenseFrequency>(
    initial?.frequency ?? "monthly"
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const amt = Number(amount);
    if (!name.trim() || !Number.isFinite(amt) || amt < 0) {
      setError("Name and a non-negative amount are required");
      return;
    }
    setSaving(true);
    try {
      const url =
        mode === "create"
          ? "/api/admin/expenses"
          : `/api/admin/expenses/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          amount_cad: amt,
          category,
          frequency,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      onSaved({
        name: name.trim(),
        amount_cad: amt,
        category,
        frequency,
        notes: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mf-input"
            placeholder="e.g. Squarespace"
          />
        </Field>
        <Field label="Amount (CAD)" required>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="mf-input cursor-pointer capitalize"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Frequency">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}
            className="mf-input cursor-pointer"
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mf-input"
        />
      </Field>

      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-sm border"
          style={{
            backgroundColor: "rgba(224, 82, 82, 0.12)",
            borderColor: "#e05252",
            color: "#e05252",
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{
            backgroundColor: "#c4973a",
            color: "#0a1a0d",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Saving…" : mode === "create" ? "Add Expense" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold border"
          style={{
            backgroundColor: "transparent",
            borderColor: "#2d6b35",
            color: "#e8d5a3",
          }}
        >
          Cancel
        </button>
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
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "#e8d5a3" }}
      >
        {label}
        {required && <span style={{ color: "#e05252" }}> *</span>}
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
