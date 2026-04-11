import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import type { OrderStatus, Account } from "@/types/database";
import { Package, FileText, Users, Upload } from "lucide-react";

type OrderRow = {
  id: string;
  status: string;
  total_cad: number | null;
  created_at: string;
  account: { email: string } | null;
  order_lines: Array<{ test: { name: string } | null }>;
};

export default async function AdminDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: accountRaw } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const account = accountRaw as Pick<Account, "role"> | null;

  if (!account || account.role !== "admin") redirect("/portal");

  const [
    { count: totalOrders },
    { count: totalPatients },
    { count: pendingResults },
    { data: recentOrdersRaw },
    { data: ordersByStatusRaw },
  ] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("role", "patient"),
    supabase
      .from("order_lines")
      .select("id", { count: "exact", head: true })
      .not("id", "in", `(${await getResultOrderLineIds(supabase)})`),
    supabase
      .from("orders")
      .select(`
        id, status, total_cad, created_at,
        account:accounts(email),
        order_lines(test:tests(name))
      `)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("orders").select("status"),
  ]);

  const recentOrders = (recentOrdersRaw ?? []) as unknown as OrderRow[];
  const ordersByStatus = (ordersByStatusRaw ?? []) as Array<{ status: string }>;

  const statusCounts = ordersByStatus.reduce<Record<string, number>>(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const statuses: OrderStatus[] = [
    "pending",
    "confirmed",
    "collected",
    "shipped",
    "resulted",
    "complete",
    "cancelled",
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Orders", value: totalOrders ?? 0, icon: Package },
          { label: "Patients", value: totalPatients ?? 0, icon: Users },
          {
            label: "Awaiting Upload",
            value: pendingResults ?? 0,
            icon: Upload,
            highlight: (pendingResults ?? 0) > 0,
          },
          {
            label: "Active Orders",
            value:
              (statusCounts["confirmed"] ?? 0) +
              (statusCounts["collected"] ?? 0) +
              (statusCounts["shipped"] ?? 0) +
              (statusCounts["resulted"] ?? 0),
            icon: FileText,
          },
        ].map(({ label, value, icon: Icon, highlight }) => (
          <div
            key={label}
            className="rounded-xl border p-5 flex items-center gap-3"
            style={{
              backgroundColor: "#1a3d22",
              borderColor: highlight ? "#c4973a" : "#2d6b35",
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: "#0f2614",
                borderColor: highlight ? "#c4973a" : "#2d6b35",
              }}
            >
              <Icon
                className="w-5 h-5"
                style={{ color: highlight ? "#c4973a" : "#8dc63f" }}
              />
            </div>
            <div>
              <p
                className="text-2xl font-semibold"
                style={{ color: "#ffffff" }}
              >
                {value}
              </p>
              <p className="text-xs" style={{ color: "#6ab04c" }}>
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
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
            Orders by Status
          </h2>
          <div className="space-y-2">
            {statuses.map((status) => (
              <div key={status} className="flex items-center justify-between">
                <OrderStatusBadge status={status} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: "#ffffff" }}
                >
                  {statusCounts[status] ?? 0}
                </span>
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
            {[
              { href: "/admin/results", label: "Upload Lab Results", icon: Upload },
              { href: "/admin/orders", label: "Manage Orders", icon: Package },
            ].map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: "#2d6b35",
                  color: "#e8d5a3",
                }}
              >
                <Icon className="w-4 h-4" style={{ color: "#c4973a" }} />
                <span className="text-sm font-medium">{label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div
          className="px-6 py-4 border-b"
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
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
              >
                <th
                  className="px-6 py-3 text-left text-xs font-medium uppercase"
                  style={{ color: "#6ab04c" }}
                >
                  Order
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium uppercase"
                  style={{ color: "#6ab04c" }}
                >
                  Patient
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium uppercase"
                  style={{ color: "#6ab04c" }}
                >
                  Tests
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium uppercase"
                  style={{ color: "#6ab04c" }}
                >
                  Status
                </th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium uppercase"
                  style={{ color: "#6ab04c" }}
                >
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order, idx) => (
                <tr
                  key={order.id}
                  style={{
                    borderTop: idx > 0 ? "1px solid #2d6b35" : "none",
                  }}
                >
                  <td
                    className="px-6 py-3 font-mono text-xs"
                    style={{ color: "#6ab04c" }}
                  >
                    #{order.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-6 py-3" style={{ color: "#e8d5a3" }}>
                    {order.account?.email ?? "—"}
                  </td>
                  <td
                    className="px-6 py-3 max-w-xs truncate"
                    style={{ color: "#ffffff" }}
                  >
                    {order.order_lines
                      .map((l) => l.test?.name)
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-6 py-3">
                    <OrderStatusBadge status={order.status as OrderStatus} />
                  </td>
                  <td
                    className="px-6 py-3 text-right text-xs whitespace-nowrap"
                    style={{ color: "#6ab04c" }}
                  >
                    {formatDate(order.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

async function getResultOrderLineIds(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>
) {
  const { data } = await supabase.from("results").select("order_line_id");
  return (
    (data as Array<{ order_line_id: string }> | null)
      ?.map((r) => r.order_line_id)
      .join(",") ?? "null"
  );
}
