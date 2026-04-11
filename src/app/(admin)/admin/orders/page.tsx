import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import type { OrderStatus, Account } from "@/types/database";
import { AdminOrderStatusUpdater } from "@/components/AdminOrderStatusUpdater";

type OrderRow = {
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

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
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

  const params = await searchParams;
  const searchQuery = params.q ?? "";

  const { data: ordersRaw } = await supabase
    .from("orders")
    .select(`
      id, status, total_cad, created_at, updated_at,
      account:accounts(email),
      order_lines(
        id,
        test:tests(name),
        profile:patient_profiles(first_name, last_name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = (ordersRaw ?? []) as unknown as OrderRow[];

  const filteredOrders = orders.filter((order) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const email = order.account?.email ?? "";
    return email.toLowerCase().includes(q) || order.id.toLowerCase().includes(q);
  });

  const statusOptions: OrderStatus[] = [
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
          <span style={{ color: "#c4973a" }}>Orders</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Manage and update status for all patient orders.
        </p>
      </div>

      <form method="get" className="mb-6">
        <input
          type="text"
          name="q"
          defaultValue={searchQuery}
          placeholder="Search by patient email or order ID…"
          className="mf-input max-w-sm"
        />
      </form>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
              >
                {["Order", "Patient", "Tests", "Total", "Status", "Date"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-6 py-3 text-xs font-medium uppercase ${i === 5 ? "text-right" : "text-left"}`}
                      style={{ color: "#6ab04c" }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center"
                    style={{ color: "#6ab04c" }}
                  >
                    No orders found.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr
                    key={order.id}
                    style={{
                      borderTop: idx > 0 ? "1px solid #2d6b35" : "none",
                    }}
                  >
                    <td
                      className="px-6 py-3 font-mono text-xs whitespace-nowrap"
                      style={{ color: "#6ab04c" }}
                    >
                      #{order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td
                      className="px-6 py-3 max-w-[180px] truncate"
                      style={{ color: "#e8d5a3" }}
                    >
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
                    <td
                      className="px-6 py-3 font-semibold whitespace-nowrap"
                      style={{ color: "#c4973a" }}
                    >
                      {order.total_cad != null ? formatCurrency(order.total_cad) : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <AdminOrderStatusUpdater
                        orderId={order.id}
                        currentStatus={order.status as OrderStatus}
                        statusOptions={statusOptions}
                      />
                    </td>
                    <td
                      className="px-6 py-3 text-right text-xs whitespace-nowrap"
                      style={{ color: "#6ab04c" }}
                    >
                      {formatDate(order.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
