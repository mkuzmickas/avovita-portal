import Link from "next/link";
import {
  Package,
  Users,
  FlaskConical,
  Upload,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPendingResultsCount } from "@/lib/admin-stats";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/types/database";

export const dynamic = "force-dynamic";

type RecentOrderRow = {
  id: string;
  status: string;
  total_cad: number | null;
  created_at: string;
  account: { email: string } | null;
  order_lines: Array<{
    id: string;
    test: { name: string } | null;
    profile: { first_name: string; last_name: string } | null;
  }>;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  collected: "Collected",
  shipped: "Shipped",
  resulted: "Resulted",
  complete: "Complete",
  cancelled: "Cancelled",
};

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "collected",
  "shipped",
  "resulted",
  "complete",
  "cancelled",
];

export default async function AdminDashboard() {
  const service = createServiceRoleClient();

  const [
    { count: totalOrders },
    { count: totalPatients },
    { count: totalActiveTests },
    { data: ordersByStatusRaw },
    { data: recentOrdersRaw },
    pendingResultsCount,
  ] = await Promise.all([
    service.from("orders").select("id", { count: "exact", head: true }),
    service
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("role", "patient"),
    service
      .from("tests")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    service.from("orders").select("status"),
    service
      .from("orders")
      .select(
        `
        id, status, total_cad, created_at,
        account:accounts(email),
        order_lines(
          id,
          test:tests(name),
          profile:patient_profiles(first_name, last_name)
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(10),
    getPendingResultsCount(service),
  ]);

  const ordersByStatus = (ordersByStatusRaw ?? []) as Array<{ status: string }>;
  const recentOrders = (recentOrdersRaw ?? []) as unknown as RecentOrderRow[];

  const statusCounts = ordersByStatus.reduce<Record<string, number>>(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const activeOrdersCount =
    (statusCounts["confirmed"] ?? 0) +
    (statusCounts["collected"] ?? 0) +
    (statusCounts["shipped"] ?? 0) +
    (statusCounts["resulted"] ?? 0);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Admin <span style={{ color: "#c4973a" }}>Dashboard</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          AvoVita Wellness operations overview
        </p>
      </div>

      {/* ─── Primary metrics ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <MetricCard
          label="Total Orders"
          value={totalOrders ?? 0}
          icon={Package}
        />
        <MetricCard
          label="Active Orders"
          value={activeOrdersCount}
          icon={ClipboardList}
        />
        <MetricCard
          label="Patients"
          value={totalPatients ?? 0}
          icon={Users}
        />
        <MetricCard
          label="Pending Uploads"
          value={pendingResultsCount}
          icon={Upload}
          highlight={pendingResultsCount > 0}
        />
        <MetricCard
          label="Active Tests"
          value={totalActiveTests ?? 0}
          icon={FlaskConical}
        />
      </div>

      {/* ─── Status breakdown + Quick actions ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div
          className="lg:col-span-2 rounded-xl border p-5"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <h2
            className="font-heading text-lg font-semibold mb-4"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Orders by Status
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ALL_STATUSES.map((status) => (
              <div
                key={status}
                className="rounded-lg border p-3"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: "#2d6b35",
                }}
              >
                <p
                  className="text-2xl font-semibold mb-1"
                  style={{ color: "#ffffff" }}
                >
                  {statusCounts[status] ?? 0}
                </p>
                <p className="text-xs" style={{ color: "#6ab04c" }}>
                  {STATUS_LABELS[status]}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <h2
            className="font-heading text-lg font-semibold mb-4"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Quick Actions
          </h2>
          <div className="space-y-2">
            <QuickActionLink href="/admin/results" label="Upload Results" />
            <QuickActionLink href="/admin/orders" label="View Orders" />
            <QuickActionLink href="/admin/tests" label="Manage Tests" />
          </div>
        </div>
      </div>

      {/* ─── Recent activity feed ──────────────────────────────────────── */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: "#2d6b35" }}
        >
          <h2
            className="font-heading text-lg font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Recent Activity
          </h2>
          <Link
            href="/admin/orders"
            className="text-sm font-medium flex items-center gap-1"
            style={{ color: "#c4973a" }}
          >
            All orders <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p style={{ color: "#6ab04c" }}>No orders yet</p>
          </div>
        ) : (
          <ul>
            {recentOrders.map((order, idx) => {
              const primaryProfile = order.order_lines[0]?.profile;
              const patientName = primaryProfile
                ? `${primaryProfile.first_name} ${primaryProfile.last_name}`
                : (order.account?.email ?? "Unknown");
              const testNames = order.order_lines
                .map((l) => l.test?.name)
                .filter(Boolean)
                .slice(0, 2)
                .join(", ");
              const extraCount =
                order.order_lines.length > 2
                  ? ` +${order.order_lines.length - 2} more`
                  : "";

              return (
                <li
                  key={order.id}
                  className="px-6 py-4 flex items-center gap-4"
                  style={{
                    borderTop: idx > 0 ? "1px solid #0f2614" : "none",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="font-mono text-xs"
                        style={{ color: "#6ab04c" }}
                      >
                        #{order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <OrderStatusBadge status={order.status as OrderStatus} />
                    </div>
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "#ffffff" }}
                    >
                      {patientName}
                    </p>
                    <p
                      className="text-xs truncate mt-0.5"
                      style={{ color: "#e8d5a3" }}
                    >
                      {testNames || "—"}
                      {extraCount}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "#c4973a" }}
                    >
                      {order.total_cad != null
                        ? formatCurrency(order.total_cad)
                        : "—"}
                    </p>
                    <p className="text-xs" style={{ color: "#6ab04c" }}>
                      {formatDate(order.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: typeof Package;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "#1a3d22",
        borderColor: highlight ? "#c4973a" : "#2d6b35",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0"
          style={{
            backgroundColor: "#0f2614",
            borderColor: highlight ? "#c4973a" : "#2d6b35",
          }}
        >
          <Icon
            className="w-4 h-4"
            style={{ color: highlight ? "#c4973a" : "#8dc63f" }}
          />
        </div>
        <p className="text-xs font-medium" style={{ color: "#e8d5a3" }}>
          {label}
        </p>
      </div>
      <p
        className="text-3xl font-semibold"
        style={{ color: "#ffffff" }}
      >
        {value}
      </p>
    </div>
  );
}

function QuickActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-colors"
      style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
    >
      <span>{label}</span>
      <ArrowRight className="w-4 h-4" />
    </Link>
  );
}
