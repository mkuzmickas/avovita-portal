"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  type PieLabelRenderProps,
} from "recharts";
import {
  Eye,
  Users,
  ShoppingCart,
  TrendingUp,
  Download,
  Monitor,
  Tablet,
  Smartphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ── Types ──────────────────────────────────────────────────────────── */

interface Org {
  id: string;
  name: string;
  slug: string;
}

interface AnalyticsDashboardProps {
  organizations: Org[];
}

type DateRange = "today" | "7d" | "30d" | "90d" | "custom";

interface PageView {
  path: string;
  account_id: string | null;
  org_id: string | null;
  session_id: string | null;
  device_type: string | null;
  created_at: string;
}

interface AnalyticsEvent {
  event_type: string;
  event_data: Record<string, unknown> | null;
  org_id: string | null;
  session_id: string | null;
  created_at: string;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function rangeStart(range: DateRange, customStart?: string): string {
  const now = new Date();
  switch (range) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 86400000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 86400000).toISOString();
    case "90d":
      return new Date(now.getTime() - 90 * 86400000).toISOString();
    case "custom":
      return customStart
        ? new Date(customStart).toISOString()
        : new Date(now.getTime() - 30 * 86400000).toISOString();
  }
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmt(n: number): string {
  return n.toLocaleString("en-CA");
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function pct(n: number, d: number): string {
  if (d === 0) return "0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

/* ── Theme colors ───────────────────────────────────────────────────── */

const GOLD = "#c4973a";
const GOLD_HOVER = "#d4a84a";
const GREEN = "#6ab04c";
const CREAM = "#e8d5a3";
const BG_DARK = "#0a1a0d";
const BG_MID = "#0f2614";
const BG_CARD = "#1a3d22";
const BG_HOVER = "#1f4a28";
const BORDER = "#2d6b35";
const RED = "#e05252";
const CHART_COLORS = [GOLD, GREEN, "#4ecdc4", "#ff6b6b", "#a29bfe", "#feca57"];

/* ── Dashboard ──────────────────────────────────────────────────────── */

export function AnalyticsDashboard({ organizations }: AnalyticsDashboardProps) {
  const [range, setRange] = useState<DateRange>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [pageViews, setPageViews] = useState<PageView[]>([]);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = rangeStart(range, customStart);
    const end =
      range === "custom" && customEnd
        ? new Date(customEnd + "T23:59:59").toISOString()
        : new Date().toISOString();

    const [pvRes, evRes] = await Promise.all([
      supabase
        .from("page_views")
        .select("path, account_id, org_id, session_id, device_type, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true })
        .limit(50000),
      supabase
        .from("analytics_events")
        .select("event_type, event_data, org_id, session_id, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true })
        .limit(50000),
    ]);

    setPageViews((pvRes.data ?? []) as unknown as PageView[]);
    setEvents((evRes.data ?? []) as unknown as AnalyticsEvent[]);
    setLoading(false);
  }, [supabase, range, customStart, customEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Derived stats ──────────────────────────────────────────────── */

  const totalViews = pageViews.length;
  const uniqueSessions = new Set(pageViews.map((p) => p.session_id).filter(Boolean)).size;
  const loggedInViews = pageViews.filter((p) => p.account_id).length;
  const guestViews = totalViews - loggedInViews;
  const orgViews = pageViews.filter((p) => p.org_id).length;
  const directViews = totalViews - orgViews;

  // Daily views for chart
  const dailyViews = useMemo(() => {
    const map = new Map<string, { direct: number; org: number }>();
    for (const pv of pageViews) {
      const dk = dayKey(pv.created_at);
      const entry = map.get(dk) ?? { direct: 0, org: 0 };
      if (pv.org_id) entry.org++;
      else entry.direct++;
      map.set(dk, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        date: dateLabel(day),
        Direct: v.direct,
        Org: v.org,
      }));
  }, [pageViews]);

  // Top pages
  const topPages = useMemo(() => {
    const map = new Map<string, number>();
    for (const pv of pageViews) {
      map.set(pv.path, (map.get(pv.path) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([path, count]) => ({ path, count }));
  }, [pageViews]);

  // Events by type
  const eventsByType = useCallback(
    (type: string) => events.filter((e) => e.event_type === type),
    [events],
  );

  // Test catalogue analytics
  const testViewedEvents = useMemo(() => eventsByType("test_viewed"), [eventsByType]);
  const testAddedEvents = useMemo(() => eventsByType("test_added_to_cart"), [eventsByType]);

  const mostViewedTests = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const e of testViewedEvents) {
      const id = (e.event_data?.test_id as string) ?? "unknown";
      const name = (e.event_data?.test_name as string) ?? id;
      const entry = map.get(id) ?? { name, count: 0 };
      entry.count++;
      map.set(id, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  }, [testViewedEvents]);

  const mostAddedTests = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const e of testAddedEvents) {
      const id = (e.event_data?.test_id as string) ?? "unknown";
      const name = (e.event_data?.test_name as string) ?? id;
      const entry = map.get(id) ?? { name, count: 0 };
      entry.count++;
      map.set(id, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  }, [testAddedEvents]);

  const testConversion = useMemo(() => {
    const viewMap = new Map<string, { name: string; views: number }>();
    for (const e of testViewedEvents) {
      const id = (e.event_data?.test_id as string) ?? "";
      const name = (e.event_data?.test_name as string) ?? id;
      const entry = viewMap.get(id) ?? { name, views: 0 };
      entry.views++;
      viewMap.set(id, entry);
    }
    const addMap = new Map<string, number>();
    for (const e of testAddedEvents) {
      const id = (e.event_data?.test_id as string) ?? "";
      addMap.set(id, (addMap.get(id) ?? 0) + 1);
    }
    return [...viewMap.entries()]
      .map(([id, v]) => ({
        name: v.name,
        views: v.views,
        adds: addMap.get(id) ?? 0,
        rate: v.views > 0 ? ((addMap.get(id) ?? 0) / v.views) * 100 : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 15);
  }, [testViewedEvents, testAddedEvents]);

  // Checkout funnel
  const funnelData = useMemo(() => {
    const started = eventsByType("checkout_started").length;
    const step1 = eventsByType("checkout_step_completed").filter(
      (e) => (e.event_data?.step as number) === 1,
    ).length;
    const step2 = eventsByType("checkout_step_completed").filter(
      (e) => (e.event_data?.step as number) === 2,
    ).length;
    const step3 = eventsByType("checkout_step_completed").filter(
      (e) => (e.event_data?.step as number) === 3,
    ).length;
    const step4 = eventsByType("checkout_step_completed").filter(
      (e) => (e.event_data?.step as number) === 4,
    ).length;
    const completed = eventsByType("order_completed").length;

    const steps = [
      { label: "Checkout Started", count: started },
      { label: "Step 1 — People", count: step1 },
      { label: "Step 2 — Assign", count: step2 },
      { label: "Step 3 — Collection", count: step3 },
      { label: "Step 4 — Review", count: step4 },
      { label: "Order Completed", count: completed },
    ];
    return steps.map((s, i) => ({
      ...s,
      pct: steps[0].count > 0 ? (s.count / steps[0].count) * 100 : 0,
      dropOff:
        i > 0 && steps[i - 1].count > 0
          ? ((steps[i - 1].count - s.count) / steps[i - 1].count) * 100
          : 0,
    }));
  }, [eventsByType]);

  // Orders & revenue
  const orderEvents = useMemo(() => eventsByType("order_completed"), [eventsByType]);
  const dailyOrders = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number }>();
    for (const e of orderEvents) {
      const dk = dayKey(e.created_at);
      const entry = map.get(dk) ?? { orders: 0, revenue: 0 };
      entry.orders++;
      entry.revenue += (e.event_data?.total as number) ?? 0;
      map.set(dk, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        date: dateLabel(day),
        Orders: v.orders,
        Revenue: v.revenue,
      }));
  }, [orderEvents]);

  const totalOrders = orderEvents.length;
  const totalRevenue = orderEvents.reduce(
    (s, e) => s + ((e.event_data?.total as number) ?? 0),
    0,
  );
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Promo codes
  const promoEvents = useMemo(() => eventsByType("promo_code_applied"), [eventsByType]);
  const promoBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of promoEvents) {
      const code = (e.event_data?.code as string) ?? "unknown";
      map.set(code, (map.get(code) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([code, count]) => ({ code, count }));
  }, [promoEvents]);

  // AI Test Finder
  const aiOpened = useMemo(() => eventsByType("ai_finder_opened").length, [eventsByType]);
  const aiAdded = useMemo(() => eventsByType("ai_finder_test_added").length, [eventsByType]);
  const catalogueAdded = testAddedEvents.length - aiAdded;

  // Org breakdown
  const orgBreakdown = useMemo(() => {
    return organizations.map((org) => {
      const views = pageViews.filter((p) => p.org_id === org.id).length;
      const orders = orderEvents.filter((e) => e.org_id === org.id).length;
      const revenue = orderEvents
        .filter((e) => e.org_id === org.id)
        .reduce((s, e) => s + ((e.event_data?.total as number) ?? 0), 0);
      return { name: org.name, views, orders, revenue };
    });
  }, [organizations, pageViews, orderEvents]);

  const directStats = useMemo(
    () => ({
      views: directViews,
      orders: orderEvents.filter((e) => !e.org_id).length,
      revenue: orderEvents
        .filter((e) => !e.org_id)
        .reduce((s, e) => s + ((e.event_data?.total as number) ?? 0), 0),
    }),
    [directViews, orderEvents],
  );

  // Device breakdown
  const deviceBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const pv of pageViews) {
      const d = pv.device_type ?? "unknown";
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [pageViews]);

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Analytics <span style={{ color: GOLD }}>Dashboard</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: CREAM }}>
            Portal traffic, engagement, and conversion data
          </p>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              ["today", "Today"],
              ["7d", "7 days"],
              ["30d", "30 days"],
              ["90d", "90 days"],
              ["custom", "Custom"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={
                range === key
                  ? { backgroundColor: GOLD, color: BG_DARK }
                  : {
                      backgroundColor: BG_CARD,
                      color: CREAM,
                      border: `1px solid ${BORDER}`,
                    }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {range === "custom" && (
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="mf-input text-sm"
            style={{ maxWidth: 180 }}
          />
          <span style={{ color: CREAM }}>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="mf-input text-sm"
            style={{ maxWidth: 180 }}
          />
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <p className="text-sm" style={{ color: GREEN }}>
            Loading analytics...
          </p>
        </div>
      ) : (
        <>
          {/* ─── OVERVIEW CARDS ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Eye className="w-5 h-5" />}
              label="Page Views"
              value={fmt(totalViews)}
            />
            <StatCard
              icon={<Users className="w-5 h-5" />}
              label="Unique Sessions"
              value={fmt(uniqueSessions)}
            />
            <StatCard
              icon={<Users className="w-5 h-5" />}
              label="Logged In / Guest"
              value={`${fmt(loggedInViews)} / ${fmt(guestViews)}`}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Direct / Org Traffic"
              value={`${fmt(directViews)} / ${fmt(orgViews)}`}
            />
          </div>

          {/* ─── TRAFFIC CHART ──────────────────────────────────────── */}
          <Section title="Traffic Over Time">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyViews}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: CREAM, fontSize: 11 }}
                    stroke={BORDER}
                  />
                  <YAxis tick={{ fill: CREAM, fontSize: 11 }} stroke={BORDER} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: BG_MID,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      color: "#fff",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Direct"
                    stroke={GOLD}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Org"
                    stroke={GREEN}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-6 mt-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-0.5 rounded"
                  style={{ backgroundColor: GOLD }}
                />
                <span style={{ color: CREAM }}>AvoVita Direct</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-0.5 rounded"
                  style={{ backgroundColor: GREEN }}
                />
                <span style={{ color: CREAM }}>Organization Traffic</span>
              </span>
            </div>
          </Section>

          {/* ─── TOP PAGES ──────────────────────────────────────────── */}
          <Section
            title="Top Pages"
            action={
              <ExportButton
                onClick={() =>
                  downloadCSV(
                    "top-pages.csv",
                    ["Path", "Views", "% of Total"],
                    topPages.map((p) => [
                      p.path,
                      String(p.count),
                      pct(p.count, totalViews),
                    ]),
                  )
                }
              />
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <TH>Path</TH>
                    <TH align="right">Views</TH>
                    <TH align="right">% of Total</TH>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map((p) => (
                    <tr
                      key={p.path}
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                    >
                      <TD>{p.path}</TD>
                      <TD align="right">{fmt(p.count)}</TD>
                      <TD align="right">{pct(p.count, totalViews)}</TD>
                    </tr>
                  ))}
                  {topPages.length === 0 && (
                    <tr>
                      <TD colSpan={3}>No data yet</TD>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ─── TEST CATALOGUE ANALYTICS ────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section
              title="Most Viewed Tests"
              action={
                <ExportButton
                  onClick={() =>
                    downloadCSV(
                      "most-viewed-tests.csv",
                      ["Test", "Views"],
                      mostViewedTests.map((t) => [t.name, String(t.count)]),
                    )
                  }
                />
              }
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <TH>Test</TH>
                    <TH align="right">Views</TH>
                  </tr>
                </thead>
                <tbody>
                  {mostViewedTests.map((t) => (
                    <tr
                      key={t.name}
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                    >
                      <TD>{t.name}</TD>
                      <TD align="right">{fmt(t.count)}</TD>
                    </tr>
                  ))}
                  {mostViewedTests.length === 0 && (
                    <tr>
                      <TD colSpan={2}>No data yet</TD>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>

            <Section
              title="Most Added to Cart"
              action={
                <ExportButton
                  onClick={() =>
                    downloadCSV(
                      "most-added-tests.csv",
                      ["Test", "Adds"],
                      mostAddedTests.map((t) => [t.name, String(t.count)]),
                    )
                  }
                />
              }
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <TH>Test</TH>
                    <TH align="right">Added</TH>
                  </tr>
                </thead>
                <tbody>
                  {mostAddedTests.map((t) => (
                    <tr
                      key={t.name}
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                    >
                      <TD>{t.name}</TD>
                      <TD align="right">{fmt(t.count)}</TD>
                    </tr>
                  ))}
                  {mostAddedTests.length === 0 && (
                    <tr>
                      <TD colSpan={2}>No data yet</TD>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>
          </div>

          {/* Conversion rate table */}
          <Section
            title="Test Conversion Rate (Viewed → Added)"
            action={
              <ExportButton
                onClick={() =>
                  downloadCSV(
                    "test-conversion.csv",
                    ["Test", "Views", "Adds", "Conversion %"],
                    testConversion.map((t) => [
                      t.name,
                      String(t.views),
                      String(t.adds),
                      `${t.rate.toFixed(1)}%`,
                    ]),
                  )
                }
              />
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <TH>Test</TH>
                    <TH align="right">Views</TH>
                    <TH align="right">Adds</TH>
                    <TH align="right">Conversion</TH>
                  </tr>
                </thead>
                <tbody>
                  {testConversion.map((t) => (
                    <tr
                      key={t.name}
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                    >
                      <TD>{t.name}</TD>
                      <TD align="right">{fmt(t.views)}</TD>
                      <TD align="right">{fmt(t.adds)}</TD>
                      <TD align="right">
                        <span
                          style={{
                            color: t.rate > 10 ? GREEN : t.rate > 0 ? GOLD : RED,
                          }}
                        >
                          {t.rate.toFixed(1)}%
                        </span>
                      </TD>
                    </tr>
                  ))}
                  {testConversion.length === 0 && (
                    <tr>
                      <TD colSpan={4}>No data yet</TD>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ─── CHECKOUT FUNNEL ─────────────────────────────────────── */}
          <Section title="Checkout Funnel">
            <div className="space-y-2">
              {funnelData.map((step, i) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div
                    className="w-40 text-xs font-medium truncate"
                    style={{ color: CREAM }}
                  >
                    {step.label}
                  </div>
                  <div className="flex-1 relative h-8 rounded-lg overflow-hidden" style={{ backgroundColor: BG_DARK }}>
                    <div
                      className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                      style={{
                        width: `${Math.max(step.pct, 2)}%`,
                        backgroundColor:
                          i === funnelData.length - 1 ? GREEN : GOLD,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center px-3">
                      <span
                        className="text-xs font-semibold"
                        style={{ color: "#fff" }}
                      >
                        {fmt(step.count)} ({step.pct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  {i > 0 && step.dropOff > 0 && (
                    <span
                      className="text-xs w-16 text-right shrink-0"
                      style={{ color: RED }}
                    >
                      -{step.dropOff.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* ─── ORDERS & REVENUE ────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<ShoppingCart className="w-5 h-5" />}
              label="Total Orders"
              value={fmt(totalOrders)}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Total Revenue"
              value={fmtCurrency(totalRevenue)}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Avg Order Value"
              value={fmtCurrency(avgOrderValue)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Daily Orders">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyOrders}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: CREAM, fontSize: 11 }}
                      stroke={BORDER}
                    />
                    <YAxis
                      tick={{ fill: CREAM, fontSize: 11 }}
                      stroke={BORDER}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: BG_MID,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 8,
                        color: "#fff",
                      }}
                    />
                    <Bar dataKey="Orders" fill={GOLD} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Daily Revenue">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyOrders}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: CREAM, fontSize: 11 }}
                      stroke={BORDER}
                    />
                    <YAxis
                      tick={{ fill: CREAM, fontSize: 11 }}
                      stroke={BORDER}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: BG_MID,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 8,
                        color: "#fff",
                      }}
                      formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "Revenue"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="Revenue"
                      stroke={GREEN}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          {/* Promo code breakdown */}
          <Section
            title="Promo Code Usage"
            action={
              <ExportButton
                onClick={() =>
                  downloadCSV(
                    "promo-usage.csv",
                    ["Code", "Times Used"],
                    promoBreakdown.map((p) => [p.code, String(p.count)]),
                  )
                }
              />
            }
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <TH>Code</TH>
                  <TH align="right">Times Used</TH>
                </tr>
              </thead>
              <tbody>
                {promoBreakdown.map((p) => (
                  <tr
                    key={p.code}
                    style={{ borderBottom: `1px solid ${BORDER}` }}
                  >
                    <TD>
                      <span
                        className="font-mono text-xs px-2 py-0.5 rounded"
                        style={{ backgroundColor: BG_DARK, color: GOLD }}
                      >
                        {p.code}
                      </span>
                    </TD>
                    <TD align="right">{fmt(p.count)}</TD>
                  </tr>
                ))}
                {promoBreakdown.length === 0 && (
                  <tr>
                    <TD colSpan={2}>No promo codes used yet</TD>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* ─── AI TEST FINDER ──────────────────────────────────────── */}
          <Section title="AI Test Finder">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MiniStat label="Times Opened" value={fmt(aiOpened)} />
              <MiniStat
                label="Tests Added (AI Finder)"
                value={fmt(aiAdded)}
              />
              <MiniStat
                label="Tests Added (Catalogue)"
                value={fmt(catalogueAdded)}
              />
            </div>
          </Section>

          {/* ─── ORG BREAKDOWN ───────────────────────────────────────── */}
          <Section
            title="Organization Breakdown"
            action={
              <ExportButton
                onClick={() =>
                  downloadCSV(
                    "org-breakdown.csv",
                    ["Source", "Views", "Orders", "Revenue"],
                    [
                      [
                        "AvoVita Direct",
                        String(directStats.views),
                        String(directStats.orders),
                        fmtCurrency(directStats.revenue),
                      ],
                      ...orgBreakdown.map((o) => [
                        o.name,
                        String(o.views),
                        String(o.orders),
                        fmtCurrency(o.revenue),
                      ]),
                    ],
                  )
                }
              />
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <TH>Source</TH>
                    <TH align="right">Views</TH>
                    <TH align="right">Orders</TH>
                    <TH align="right">Revenue</TH>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <TD>
                      <span className="font-semibold" style={{ color: GOLD }}>
                        AvoVita Direct
                      </span>
                    </TD>
                    <TD align="right">{fmt(directStats.views)}</TD>
                    <TD align="right">{fmt(directStats.orders)}</TD>
                    <TD align="right">{fmtCurrency(directStats.revenue)}</TD>
                  </tr>
                  {orgBreakdown.map((o) => (
                    <tr
                      key={o.name}
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                    >
                      <TD>{o.name}</TD>
                      <TD align="right">{fmt(o.views)}</TD>
                      <TD align="right">{fmt(o.orders)}</TD>
                      <TD align="right">{fmtCurrency(o.revenue)}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ─── DEVICE BREAKDOWN ────────────────────────────────────── */}
          <Section title="Device Breakdown">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-64 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deviceBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      strokeWidth={0}
                      label={(props: PieLabelRenderProps) =>
                        `${props.name ?? ""} ${((Number(props.percent ?? 0)) * 100).toFixed(0)}%`
                      }
                    >
                      {deviceBreakdown.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: BG_MID,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 8,
                        color: "#fff",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {deviceBreakdown.map((d) => {
                  const Icon =
                    d.name === "mobile"
                      ? Smartphone
                      : d.name === "tablet"
                        ? Tablet
                        : Monitor;
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <Icon
                        className="w-4 h-4"
                        style={{ color: GOLD }}
                      />
                      <span
                        className="text-sm capitalize"
                        style={{ color: "#fff" }}
                      >
                        {d.name}
                      </span>
                      <span className="text-sm" style={{ color: CREAM }}>
                        — {fmt(d.value)} ({pct(d.value, totalViews)})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: BG_CARD, borderColor: BORDER }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: GOLD }}>{icon}</span>
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: GREEN }}>
          {label}
        </span>
      </div>
      <p className="text-2xl font-semibold" style={{ color: "#fff" }}>
        {value}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border p-4 text-center"
      style={{ backgroundColor: BG_DARK, borderColor: BORDER }}
    >
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: GREEN }}>
        {label}
      </p>
      <p className="text-xl font-semibold" style={{ color: "#fff" }}>
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: BG_CARD, borderColor: BORDER }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold" style={{ color: "#fff" }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
      style={{
        backgroundColor: BG_DARK,
        color: GOLD,
        border: `1px solid ${BORDER}`,
      }}
    >
      <Download className="w-3.5 h-3.5" />
      Export CSV
    </button>
  );
}

function TH({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-${align}`}
      style={{ color: GOLD }}
    >
      {children}
    </th>
  );
}

function TD({
  children,
  align = "left",
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <td
      className={`px-3 py-2 text-${align}`}
      style={{ color: CREAM }}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
}
