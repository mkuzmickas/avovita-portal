import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FlaskConical, Package, Eye, ArrowRight } from "lucide-react";
import type { PatientProfile, OrderStatus } from "@/types/database";

export default async function PortalDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: primaryProfileRaw } = await supabase
    .from("patient_profiles")
    .select("first_name, last_name")
    .eq("account_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();
  const primaryProfile = primaryProfileRaw as Pick<PatientProfile, "first_name" | "last_name"> | null;

  const { data: profilesRaw } = await supabase
    .from("patient_profiles")
    .select("id")
    .eq("account_id", user.id);
  const profiles = (profilesRaw ?? []) as Array<{ id: string }>;

  const profileIds = profiles.map((p) => p.id);

  const { data: ordersRaw } = await supabase
    .from("orders")
    .select(`
      id, status, total_cad, created_at,
      order_lines(
        id, quantity, unit_price_cad,
        test:tests(name),
        profile:patient_profiles(first_name, last_name)
      )
    `)
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  type OrderRow = {
    id: string;
    status: string;
    total_cad: number | null;
    created_at: string;
    order_lines: Array<{
      id: string;
      test: { name: string } | null;
      profile: { first_name: string; last_name: string } | null;
    }>;
  };
  const orders = (ordersRaw ?? []) as unknown as OrderRow[];

  let unviewedCount = 0;
  if (profileIds.length > 0) {
    const { count } = await supabase
      .from("results")
      .select("id", { count: "exact", head: true })
      .in("profile_id", profileIds)
      .is("viewed_at", null);
    unviewedCount = count ?? 0;
  }

  const activeStatuses = ["confirmed", "collected", "shipped", "resulted"];
  const activeOrders = orders.filter((o) => activeStatuses.includes(o.status));

  const firstName = primaryProfile?.first_name ?? "there";

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Welcome back, <span style={{ color: "#c4973a" }}>{firstName}</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Manage your lab tests and results from your AvoVita patient portal.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
              style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
            >
              <Package className="w-5 h-5" style={{ color: "#8dc63f" }} />
            </div>
            <div>
              <p
                className="text-2xl font-semibold"
                style={{ color: "#ffffff" }}
              >
                {activeOrders.length}
              </p>
              <p className="text-sm" style={{ color: "#e8d5a3" }}>
                Active Orders
              </p>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl border p-5"
          style={{
            backgroundColor: "#1a3d22",
            borderColor: unviewedCount > 0 ? "#c4973a" : "#2d6b35",
            boxShadow: unviewedCount > 0 ? "0 0 0 1px #c4973a" : undefined,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: "#0f2614",
                borderColor: unviewedCount > 0 ? "#c4973a" : "#2d6b35",
              }}
            >
              <Eye
                className="w-5 h-5"
                style={{ color: unviewedCount > 0 ? "#c4973a" : "#6ab04c" }}
              />
            </div>
            <div>
              <p
                className="text-2xl font-semibold"
                style={{ color: "#ffffff" }}
              >
                {unviewedCount}
              </p>
              <p className="text-sm" style={{ color: "#e8d5a3" }}>
                Unviewed Result{unviewedCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {unviewedCount > 0 && (
            <Link
              href="/portal/results"
              className="mt-3 text-sm font-medium flex items-center gap-1"
              style={{ color: "#c4973a" }}
            >
              View now <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        <div
          className="rounded-xl p-5 flex items-center justify-between border"
          style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        >
          <div>
            <p className="font-medium" style={{ color: "#ffffff" }}>
              Order More Tests
            </p>
            <p className="text-sm" style={{ color: "#e8d5a3" }}>
              Browse our catalogue
            </p>
          </div>
          <Link
            href="/tests"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            <FlaskConical className="w-4 h-4" />
            Browse
          </Link>
        </div>
      </div>

      {/* Recent orders */}
      <div
        className="rounded-xl border"
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
            Recent Orders
          </h2>
          <Link
            href="/portal/orders"
            className="text-sm font-medium flex items-center gap-1"
            style={{ color: "#c4973a" }}
          >
            All orders <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FlaskConical
              className="w-10 h-10 mx-auto mb-3"
              style={{ color: "#2d6b35" }}
            />
            <p style={{ color: "#6ab04c" }}>No orders yet.</p>
            <Link
              href="/tests"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-semibold rounded-lg transition-colors"
              style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
            >
              Browse Tests
            </Link>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#2d6b35" }}>
            {orders.map((order) => (
              <div
                key={order.id}
                className="px-6 py-4 flex items-center gap-4 border-t first:border-t-0"
                style={{ borderColor: "#2d6b35" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-mono"
                      style={{ color: "#6ab04c" }}
                    >
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <OrderStatusBadge status={order.status as OrderStatus} />
                  </div>
                  <p className="text-sm truncate" style={{ color: "#e8d5a3" }}>
                    {order.order_lines
                      .map((l) => l.test?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                    {formatDate(order.created_at)}
                  </p>
                </div>
                <p
                  className="text-sm font-semibold shrink-0"
                  style={{ color: "#c4973a" }}
                >
                  {order.total_cad != null ? formatCurrency(order.total_cad) : "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
