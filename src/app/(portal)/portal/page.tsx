import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  FlaskConical,
  Package,
  Eye,
  ArrowRight,
  Users,
  ClipboardList,
  FileText,
} from "lucide-react";
import type { PatientProfile, OrderStatus } from "@/types/database";
import { SetPasswordBanner } from "@/components/portal/SetPasswordBanner";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  status: string;
  total_cad: number | null;
  created_at: string;
  order_lines: Array<{
    id: string;
    quantity: number;
    test: { name: string } | null;
    profile: { first_name: string; last_name: string } | null;
  }>;
};

const ACTIVE_STATUSES = ["confirmed", "collected", "shipped", "resulted"];

export default async function PortalDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/portal");

  // Parallel queries for everything the dashboard needs
  const [
    { data: primaryProfileRaw },
    { data: profilesRaw },
    { data: ordersRaw },
    { data: accountRaw },
  ] = await Promise.all([
    supabase
      .from("patient_profiles")
      .select("first_name, last_name")
      .eq("account_id", user.id)
      .eq("is_primary", true)
      .maybeSingle(),
    supabase
      .from("patient_profiles")
      .select("id, first_name, last_name, is_dependent, relationship, date_of_birth")
      .eq("account_id", user.id),
    supabase
      .from("orders")
      .select(
        `
        id, status, total_cad, created_at,
        order_lines(
          id, quantity,
          test:tests(name),
          profile:patient_profiles(first_name, last_name)
        )
      `
      )
      .eq("account_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("accounts")
      .select("is_representative")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const primaryProfile = primaryProfileRaw as Pick<
    PatientProfile,
    "first_name" | "last_name"
  > | null;
  const profiles = (profilesRaw ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    is_dependent: boolean | null;
    relationship: string | null;
    date_of_birth: string;
  }>;
  const orders = (ordersRaw ?? []) as unknown as OrderRow[];
  const account = accountRaw as { is_representative: boolean | null } | null;
  const dependents = profiles.filter((p) => p.is_dependent);
  const isRepresentative =
    !!account?.is_representative && dependents.length > 0;

  const profileIds = profiles.map((p) => p.id);

  // Count unviewed results (for the gold banner + Results Ready metric)
  let unviewedCount = 0;
  if (profileIds.length > 0) {
    const { count } = await supabase
      .from("results")
      .select("id", { count: "exact", head: true })
      .in("profile_id", profileIds)
      .is("viewed_at", null);
    unviewedCount = count ?? 0;
  }

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const lifetimeTests = orders.reduce(
    (sum, o) =>
      sum +
      o.order_lines.reduce((ls, l) => ls + (l.quantity ?? 1), 0),
    0
  );

  const hasProfile = !!primaryProfile;
  const firstName = primaryProfile?.first_name ?? "";
  const recentOrders = orders.slice(0, 5);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <SetPasswordBanner />
      {/* Welcome header — variant for new users with no profiles */}
      {hasProfile ? (
        <div className="mb-6">
          <h1
            className="font-heading text-3xl sm:text-4xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Welcome back,{" "}
            <span style={{ color: "#c4973a" }}>{firstName}</span>
          </h1>
          <p className="mt-1 text-sm sm:text-base" style={{ color: "#e8d5a3" }}>
            {isRepresentative
              ? "Manage orders, results, and collection appointments for the clients in your care."
              : "Manage your lab tests and results from your AvoVita patient portal."}
          </p>
        </div>
      ) : (
        <div
          className="mb-6 rounded-xl border p-6 sm:p-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        >
          <h1
            className="font-heading text-3xl sm:text-4xl font-semibold mb-2"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Welcome to <span style={{ color: "#c4973a" }}>AvoVita</span>
          </h1>
          <p className="text-sm sm:text-base mb-5" style={{ color: "#e8d5a3" }}>
            Browse our test catalogue to place your first order.
          </p>
          <Link
            href="/tests"
            className="mf-btn-primary px-6 py-3 inline-flex"
          >
            <FlaskConical className="w-4 h-4" />
            Browse Tests
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Unviewed results gold banner */}
      {unviewedCount > 0 && (
        <div
          className="rounded-xl border p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{
            backgroundColor: "#1a3d22",
            borderColor: "#c4973a",
            boxShadow: "0 0 0 1px #c4973a",
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
            style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
          >
            <Eye className="w-6 h-6" style={{ color: "#c4973a" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="font-heading text-lg sm:text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              You have{" "}
              <span style={{ color: "#c4973a" }}>
                {unviewedCount} new result{unviewedCount !== 1 ? "s" : ""}
              </span>{" "}
              ready to view
            </p>
            <p className="text-sm mt-0.5" style={{ color: "#e8d5a3" }}>
              Log in to view and download your lab results securely.
            </p>
          </div>
          <Link
            href="/portal/results"
            className="mf-btn-primary px-5 shrink-0"
          >
            View Results
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Metric cards — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <MetricCard
          label="Active Orders"
          value={activeOrders.length}
          icon={Package}
        />
        <MetricCard
          label="Results Ready"
          value={unviewedCount}
          icon={FileText}
          highlight={unviewedCount > 0}
        />
        <MetricCard
          label="Tests Ordered"
          value={lifetimeTests}
          icon={ClipboardList}
        />
        <MetricCard
          label={isRepresentative ? "Clients in Care" : "Profiles"}
          value={isRepresentative ? dependents.length : profiles.length}
          icon={Users}
        />
      </div>

      {/* Clients in Your Care (rep variant only) */}
      {isRepresentative && dependents.length > 0 && (
        <div className="mb-8">
          <h2
            className="font-heading text-2xl font-semibold mb-4"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Clients in Your <span style={{ color: "#c4973a" }}>Care</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {dependents.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border p-4"
                style={{
                  backgroundColor: "#1a3d22",
                  borderColor: "#2d6b35",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center border shrink-0"
                    style={{
                      backgroundColor: "#0f2614",
                      borderColor: "#c4973a",
                    }}
                  >
                    <Users className="w-5 h-5" style={{ color: "#c4973a" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-semibold"
                      style={{ color: "#ffffff" }}
                    >
                      {d.first_name} {d.last_name}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "#6ab04c" }}
                    >
                      DOB {formatDate(d.date_of_birth)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div className="mb-6 flex items-center justify-between">
        <h2
          className="font-heading text-2xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Recent Orders
        </h2>
        {orders.length > 5 && (
          <Link
            href="/portal/orders"
            className="text-sm font-medium flex items-center gap-1"
            style={{ color: "#c4973a" }}
          >
            All orders <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {recentOrders.length === 0 ? (
        <div
          className="rounded-xl border px-6 py-12 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <FlaskConical
            className="w-10 h-10 mx-auto mb-3"
            style={{ color: "#2d6b35" }}
          />
          <p style={{ color: "#6ab04c" }}>No orders yet</p>
          <Link
            href="/tests"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-semibold rounded-lg"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            Browse Tests
          </Link>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {recentOrders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
              style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span
                    className="font-mono text-xs"
                    style={{ color: "#6ab04c" }}
                  >
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <OrderStatusBadge status={order.status as OrderStatus} />
                </div>
                <p
                  className="text-sm truncate"
                  style={{ color: "#ffffff" }}
                >
                  {order.order_lines
                    .map((l) => l.test?.name)
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                  {formatDate(order.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                <p
                  className="text-base font-semibold"
                  style={{ color: "#c4973a" }}
                >
                  {order.total_cad != null
                    ? formatCurrency(order.total_cad)
                    : "—"}
                </p>
                <Link
                  href="/portal/orders"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                  style={{
                    color: "#e8d5a3",
                    borderColor: "#2d6b35",
                    backgroundColor: "transparent",
                  }}
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Browse more tests CTA */}
      <Link
        href="/tests"
        className="flex items-center justify-center gap-2 w-full sm:w-auto sm:inline-flex mx-auto px-6 py-3 text-sm font-semibold rounded-xl transition-colors"
        style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
      >
        <FlaskConical className="w-4 h-4" />
        Browse More Tests
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

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
      className="rounded-xl border p-4 sm:p-5"
      style={{
        backgroundColor: "#1a3d22",
        borderColor: highlight ? "#c4973a" : "#2d6b35",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0"
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
        <p
          className="text-xs font-medium truncate"
          style={{ color: "#e8d5a3" }}
        >
          {label}
        </p>
      </div>
      <p
        className="text-2xl sm:text-3xl font-semibold"
        style={{ color: highlight ? "#c4973a" : "#ffffff" }}
      >
        {value}
      </p>
    </div>
  );
}
