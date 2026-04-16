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
  FunnelChart,
  Funnel,
  LabelList,
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
  account_id: string | null;
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

    const [pvRes, evRes, adminRes] = await Promise.all([
      supabase
        .from("page_views")
        .select("path, account_id, org_id, session_id, device_type, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true })
        .limit(50000),
      supabase
        .from("analytics_events")
        .select("event_type, event_data, account_id, org_id, session_id, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true })
        .limit(50000),
      supabase
        .from("accounts")
        .select("id")
        .eq("role", "admin"),
    ]);

    // Permanently exclude admin accounts from all dashboard data.
    const adminIds = new Set(
      ((adminRes.data ?? []) as { id: string }[]).map((a) => a.id),
    );
    const pvFiltered = ((pvRes.data ?? []) as unknown as PageView[]).filter(
      (pv) => !pv.account_id || !adminIds.has(pv.account_id),
    );
    const evFiltered = ((evRes.data ?? []) as unknown as AnalyticsEvent[]).filter(
      (ev) => !ev.account_id || !adminIds.has(ev.account_id),
    );

    setPageViews(pvFiltered);
    setEvents(evFiltered);
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

  /* ── SESSION-LEVEL CONVERSION FUNNEL ─────────────────────────────── */

  // Build a per-session record: which stages did each session_id hit,
  // org_id, device, first page_view time, and test_added_to_cart count.
  const sessionMap = useMemo(() => {
    interface SessionInfo {
      sid: string;
      firstSeen: number; // ms
      lastSeen: number; // ms
      orgId: string | null;
      deviceType: string | null;
      // Stage flags
      viewedCatalogue: boolean;
      viewedTest: boolean;
      addedToCart: boolean;
      startedCheckout: boolean;
      checkoutStartedAt: number | null;
      maxCheckoutStep: number; // 0 = none, 1-4 steps
      orderCompleted: boolean;
      // Extras
      cartCount: number;
      orderTotal: number;
      promoCodes: string[];
      addedTestIds: string[];
    }

    const map = new Map<string, SessionInfo>();

    const ensure = (sid: string, ts: number, orgId: string | null): SessionInfo => {
      let s = map.get(sid);
      if (!s) {
        s = {
          sid,
          firstSeen: ts,
          lastSeen: ts,
          orgId,
          deviceType: null,
          viewedCatalogue: false,
          viewedTest: false,
          addedToCart: false,
          startedCheckout: false,
          checkoutStartedAt: null,
          maxCheckoutStep: 0,
          orderCompleted: false,
          cartCount: 0,
          orderTotal: 0,
          promoCodes: [],
          addedTestIds: [],
        };
        map.set(sid, s);
      }
      if (ts < s.firstSeen) s.firstSeen = ts;
      if (ts > s.lastSeen) s.lastSeen = ts;
      // Keep first non-null org encountered.
      if (!s.orgId && orgId) s.orgId = orgId;
      return s;
    };

    for (const pv of pageViews) {
      if (!pv.session_id) continue;
      const ts = new Date(pv.created_at).getTime();
      const s = ensure(pv.session_id, ts, pv.org_id);
      if (!s.deviceType && pv.device_type) s.deviceType = pv.device_type;
      // Catalogue = /tests or /org/[slug]/tests (exclude /admin/tests).
      if (
        !pv.path.startsWith("/admin") &&
        (pv.path === "/tests" || /^\/org\/[^/]+\/tests/.test(pv.path))
      ) {
        s.viewedCatalogue = true;
      }
    }

    for (const ev of events) {
      if (!ev.session_id) continue;
      const ts = new Date(ev.created_at).getTime();
      const s = ensure(ev.session_id, ts, ev.org_id);
      switch (ev.event_type) {
        case "test_viewed":
          s.viewedTest = true;
          break;
        case "test_added_to_cart":
          s.addedToCart = true;
          s.cartCount += 1;
          {
            const tid = ev.event_data?.test_id;
            if (typeof tid === "string") s.addedTestIds.push(tid);
          }
          break;
        case "checkout_started":
          s.startedCheckout = true;
          if (s.checkoutStartedAt === null || ts < s.checkoutStartedAt) {
            s.checkoutStartedAt = ts;
          }
          break;
        case "checkout_step_completed": {
          const step = Number(ev.event_data?.step);
          if (Number.isFinite(step) && step > s.maxCheckoutStep) {
            s.maxCheckoutStep = step;
          }
          break;
        }
        case "order_completed":
          s.orderCompleted = true;
          {
            const t = Number(ev.event_data?.total);
            if (Number.isFinite(t)) s.orderTotal += t;
          }
          break;
        case "promo_code_applied":
          {
            const code = ev.event_data?.code;
            if (typeof code === "string") s.promoCodes.push(code);
          }
          break;
      }
    }

    return map;
  }, [pageViews, events]);

  const sessions = useMemo(() => [...sessionMap.values()], [sessionMap]);

  // Funnel stages — each stage counts unique sessions that reached it.
  const conversionFunnel = useMemo(() => {
    const stages = [
      { label: "Sessions started", count: sessions.length },
      {
        label: "Catalogue visited",
        count: sessions.filter((s) => s.viewedCatalogue).length,
      },
      {
        label: "Test viewed",
        count: sessions.filter((s) => s.viewedTest).length,
      },
      {
        label: "Test added to cart",
        count: sessions.filter((s) => s.addedToCart).length,
      },
      {
        label: "Checkout started",
        count: sessions.filter((s) => s.startedCheckout).length,
      },
      {
        label: "Checkout completed",
        count: sessions.filter((s) => s.orderCompleted).length,
      },
    ];
    return stages.map((s, i) => ({
      ...s,
      pct: stages[0].count > 0 ? (s.count / stages[0].count) * 100 : 0,
      dropOff:
        i > 0 && stages[i - 1].count > 0
          ? ((stages[i - 1].count - s.count) / stages[i - 1].count) * 100
          : 0,
    }));
  }, [sessions]);

  // Summary conversion rates.
  const conversionRates = useMemo(() => {
    const total = sessions.length;
    const catalogue = sessions.filter((s) => s.viewedCatalogue).length;
    const cart = sessions.filter((s) => s.addedToCart).length;
    const checkout = sessions.filter((s) => s.startedCheckout).length;
    const completed = sessions.filter((s) => s.orderCompleted).length;
    return {
      overall: total > 0 ? (completed / total) * 100 : 0,
      catalogueToCart: catalogue > 0 ? (cart / catalogue) * 100 : 0,
      cartToCheckout: cart > 0 ? (checkout / cart) * 100 : 0,
      checkoutCompletion: checkout > 0 ? (completed / checkout) * 100 : 0,
    };
  }, [sessions]);

  // Incomplete sessions — started checkout but didn't complete. Latest 50.
  const incompleteSessions = useMemo(() => {
    const orgLookup = new Map(organizations.map((o) => [o.id, o.name]));
    const lastStepLabel = (step: number, started: boolean): string => {
      if (step >= 4) return "Step 4 — Review";
      if (step === 3) return "Step 3 — Collection";
      if (step === 2) return "Step 2 — Assign";
      if (step === 1) return "Step 1 — People";
      return started ? "Checkout started" : "—";
    };
    return sessions
      .filter((s) => s.startedCheckout && !s.orderCompleted)
      .sort((a, b) => b.firstSeen - a.firstSeen)
      .slice(0, 50)
      .map((s) => ({
        sid: s.sid,
        startTime: new Date(s.firstSeen).toLocaleString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        orgName: s.orgId
          ? (orgLookup.get(s.orgId) ?? "Unknown org")
          : "AvoVita Direct",
        lastStep: lastStepLabel(s.maxCheckoutStep, s.startedCheckout),
        cartCount: s.cartCount,
        timeInCheckout:
          s.checkoutStartedAt !== null
            ? Math.max(0, Math.round((s.lastSeen - s.checkoutStartedAt) / 1000))
            : 0,
        deviceType: s.deviceType ?? "unknown",
      }));
  }, [sessions, organizations]);

  // Org conversion comparison.
  const orgConversion = useMemo(() => {
    const addedTestNameById = new Map<string, string>();
    for (const e of events) {
      if (e.event_type === "test_added_to_cart") {
        const id = e.event_data?.test_id;
        const name = e.event_data?.test_name;
        if (typeof id === "string" && typeof name === "string") {
          addedTestNameById.set(id, name);
        }
      }
    }

    const compute = (filter: (s: typeof sessions[number]) => boolean, name: string) => {
      const group = sessions.filter(filter);
      const total = group.length;
      const completed = group.filter((s) => s.orderCompleted);
      const revenue = completed.reduce((sum, s) => sum + s.orderTotal, 0);
      // Most popular test = most added_to_cart across sessions in this group.
      const testCounts = new Map<string, number>();
      for (const s of group) {
        for (const tid of s.addedTestIds) {
          testCounts.set(tid, (testCounts.get(tid) ?? 0) + 1);
        }
      }
      let topTestId: string | null = null;
      let topCount = 0;
      for (const [id, c] of testCounts) {
        if (c > topCount) {
          topCount = c;
          topTestId = id;
        }
      }
      const topTestName = topTestId
        ? (addedTestNameById.get(topTestId) ?? topTestId)
        : "—";
      return {
        name,
        sessions: total,
        orders: completed.length,
        conversionRate: total > 0 ? (completed.length / total) * 100 : 0,
        aov: completed.length > 0 ? revenue / completed.length : 0,
        topTest: topTestName,
      };
    };

    const rows = [compute((s) => !s.orgId, "AvoVita Direct")];
    for (const org of organizations) {
      rows.push(compute((s) => s.orgId === org.id, org.name));
    }
    return rows;
  }, [sessions, organizations, events]);

  // Promo code conversion.
  const promoConversion = useMemo(() => {
    const byCode = new Map<
      string,
      { applied: number; completed: number; revenue: number }
    >();
    for (const s of sessions) {
      const codes = new Set(s.promoCodes); // unique per session
      for (const code of codes) {
        const entry = byCode.get(code) ?? {
          applied: 0,
          completed: 0,
          revenue: 0,
        };
        entry.applied += 1;
        if (s.orderCompleted) {
          entry.completed += 1;
          entry.revenue += s.orderTotal;
        }
        byCode.set(code, entry);
      }
    }
    return [...byCode.entries()]
      .map(([code, v]) => ({
        code,
        applied: v.applied,
        completed: v.completed,
        conversionRate: v.applied > 0 ? (v.completed / v.applied) * 100 : 0,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.applied - a.applied);
  }, [sessions]);

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

          {/* ─── CONVERSION FUNNEL (SESSION-LEVEL) ──────────────────── */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: BG_MID, borderColor: BORDER }}
          >
            <div
              className="px-5 py-4 border-b"
              style={{ borderColor: BORDER, backgroundColor: BG_CARD }}
            >
              <h2
                className="font-heading text-xl font-semibold"
                style={{
                  color: "#fff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                Conversion <span style={{ color: GOLD }}>Funnel</span>
              </h2>
              <p className="text-xs mt-1" style={{ color: CREAM }}>
                Session-level journey from first page view through to
                completed order. Counts are unique sessions per stage.
              </p>
            </div>

            <div className="p-5 space-y-6">
              {/* 1. Funnel overview chart */}
              <Section title="Funnel Overview">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: BG_MID,
                          border: `1px solid ${BORDER}`,
                          borderRadius: 8,
                          color: "#fff",
                        }}
                      />
                      <Funnel
                        dataKey="count"
                        data={conversionFunnel}
                        isAnimationActive
                      >
                        <LabelList
                          position="right"
                          fill={CREAM}
                          stroke="none"
                          dataKey="label"
                          style={{ fontSize: 12, fontWeight: 600 }}
                        />
                        <LabelList
                          position="center"
                          fill={BG_DARK}
                          stroke="none"
                          dataKey="count"
                          style={{ fontSize: 13, fontWeight: 700 }}
                        />
                        {conversionFunnel.map((_, i) => (
                          <Cell key={i} fill={GOLD} />
                        ))}
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                </div>

                {/* Stage-by-stage with drop-off indicators */}
                <div className="mt-4 space-y-1.5">
                  {conversionFunnel.map((stage, i) => (
                    <div
                      key={stage.label}
                      className="flex items-center gap-3 text-xs"
                    >
                      <div
                        className="w-44 font-medium truncate"
                        style={{ color: CREAM }}
                      >
                        {stage.label}
                      </div>
                      <div
                        className="flex-1 font-semibold"
                        style={{ color: GOLD }}
                      >
                        {fmt(stage.count)} ({stage.pct.toFixed(1)}% of top)
                      </div>
                      {i > 0 && (
                        <span
                          className="w-24 text-right shrink-0"
                          style={{ color: GREEN }}
                        >
                          {stage.dropOff > 0
                            ? `−${stage.dropOff.toFixed(1)}% drop-off`
                            : "—"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* 2. Conversion rate cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={<TrendingUp className="w-5 h-5" />}
                  label="Overall Conversion"
                  value={`${conversionRates.overall.toFixed(2)}%`}
                />
                <StatCard
                  icon={<ShoppingCart className="w-5 h-5" />}
                  label="Catalogue → Cart"
                  value={`${conversionRates.catalogueToCart.toFixed(2)}%`}
                />
                <StatCard
                  icon={<ShoppingCart className="w-5 h-5" />}
                  label="Cart → Checkout"
                  value={`${conversionRates.cartToCheckout.toFixed(2)}%`}
                />
                <StatCard
                  icon={<TrendingUp className="w-5 h-5" />}
                  label="Checkout Completion"
                  value={`${conversionRates.checkoutCompletion.toFixed(2)}%`}
                />
              </div>

              {/* 3. Session journey table — incomplete sessions */}
              <Section
                title="Incomplete Sessions (Started Checkout, Did Not Complete)"
                action={
                  <ExportButton
                    onClick={() =>
                      downloadCSV(
                        "incomplete-sessions.csv",
                        [
                          "Session Start",
                          "Source",
                          "Last Step",
                          "Cart Count",
                          "Time in Checkout (s)",
                          "Device",
                        ],
                        incompleteSessions.map((r) => [
                          r.startTime,
                          r.orgName,
                          r.lastStep,
                          String(r.cartCount),
                          String(r.timeInCheckout),
                          r.deviceType,
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
                        <TH>Session Start</TH>
                        <TH>Source</TH>
                        <TH>Last Step</TH>
                        <TH align="right">Cart</TH>
                        <TH align="right">Time in Checkout</TH>
                        <TH>Device</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {incompleteSessions.map((r) => (
                        <tr
                          key={r.sid}
                          style={{ borderBottom: `1px solid ${BORDER}` }}
                        >
                          <TD>{r.startTime}</TD>
                          <TD>{r.orgName}</TD>
                          <TD>{r.lastStep}</TD>
                          <TD align="right">{fmt(r.cartCount)}</TD>
                          <TD align="right">
                            {r.timeInCheckout < 60
                              ? `${r.timeInCheckout}s`
                              : `${Math.round(r.timeInCheckout / 60)}m`}
                          </TD>
                          <TD>
                            <span
                              className="capitalize"
                              style={{ color: CREAM }}
                            >
                              {r.deviceType}
                            </span>
                          </TD>
                        </tr>
                      ))}
                      {incompleteSessions.length === 0 && (
                        <tr>
                          <TD colSpan={6}>No incomplete sessions in range</TD>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* 4. Org conversion comparison */}
              <Section
                title="Conversion by Traffic Source"
                action={
                  <ExportButton
                    onClick={() =>
                      downloadCSV(
                        "org-conversion.csv",
                        [
                          "Source",
                          "Sessions",
                          "Orders",
                          "Conversion Rate",
                          "Avg Order Value",
                          "Top Test",
                        ],
                        orgConversion.map((r) => [
                          r.name,
                          String(r.sessions),
                          String(r.orders),
                          `${r.conversionRate.toFixed(2)}%`,
                          fmtCurrency(r.aov),
                          r.topTest,
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
                        <TH>Source</TH>
                        <TH align="right">Sessions</TH>
                        <TH align="right">Orders</TH>
                        <TH align="right">Conversion</TH>
                        <TH align="right">Avg Order Value</TH>
                        <TH>Top Test</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {orgConversion.map((r, i) => (
                        <tr
                          key={r.name}
                          style={{ borderBottom: `1px solid ${BORDER}` }}
                        >
                          <TD>
                            <span
                              className="font-semibold"
                              style={{ color: i === 0 ? GOLD : "#fff" }}
                            >
                              {r.name}
                            </span>
                          </TD>
                          <TD align="right">{fmt(r.sessions)}</TD>
                          <TD align="right">{fmt(r.orders)}</TD>
                          <TD align="right">
                            <span
                              style={{
                                color:
                                  r.conversionRate > 5
                                    ? GREEN
                                    : r.conversionRate > 0
                                      ? GOLD
                                      : CREAM,
                              }}
                            >
                              {r.conversionRate.toFixed(2)}%
                            </span>
                          </TD>
                          <TD align="right">{fmtCurrency(r.aov)}</TD>
                          <TD>{r.topTest}</TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* 5. Promo code conversion */}
              <Section
                title="Promo Code Conversion"
                action={
                  <ExportButton
                    onClick={() =>
                      downloadCSV(
                        "promo-conversion.csv",
                        [
                          "Code",
                          "Applied",
                          "Completed",
                          "Conversion Rate",
                          "Revenue",
                        ],
                        promoConversion.map((r) => [
                          r.code,
                          String(r.applied),
                          String(r.completed),
                          `${r.conversionRate.toFixed(2)}%`,
                          r.revenue === 0 && r.completed > 0
                            ? `${r.completed} order${r.completed !== 1 ? "s" : ""} (100% off)`
                            : fmtCurrency(r.revenue),
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
                        <TH>Code</TH>
                        <TH align="right">Applied</TH>
                        <TH align="right">Completed</TH>
                        <TH align="right">Conversion</TH>
                        <TH align="right">Attributed Revenue</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {promoConversion.map((r) => (
                        <tr
                          key={r.code}
                          style={{ borderBottom: `1px solid ${BORDER}` }}
                        >
                          <TD>
                            <span
                              className="font-mono text-xs px-2 py-0.5 rounded"
                              style={{ backgroundColor: BG_DARK, color: GOLD }}
                            >
                              {r.code}
                            </span>
                          </TD>
                          <TD align="right">{fmt(r.applied)}</TD>
                          <TD align="right">{fmt(r.completed)}</TD>
                          <TD align="right">
                            <span
                              style={{
                                color:
                                  r.conversionRate > 20
                                    ? GREEN
                                    : r.conversionRate > 0
                                      ? GOLD
                                      : CREAM,
                              }}
                            >
                              {r.conversionRate.toFixed(2)}%
                            </span>
                          </TD>
                          <TD align="right">
                            {r.revenue === 0 && r.completed > 0 ? (
                              <span style={{ color: CREAM }}>
                                {fmt(r.completed)} order
                                {r.completed !== 1 ? "s" : ""}
                                <span
                                  className="text-xs ml-1"
                                  style={{ color: GREEN }}
                                >
                                  (100% off)
                                </span>
                              </span>
                            ) : (
                              fmtCurrency(r.revenue)
                            )}
                          </TD>
                        </tr>
                      ))}
                      {promoConversion.length === 0 && (
                        <tr>
                          <TD colSpan={5}>No promo codes applied in range</TD>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          </div>

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
