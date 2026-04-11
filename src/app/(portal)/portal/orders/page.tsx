import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import type { OrderStatus } from "@/types/database";
import { Package } from "lucide-react";

type OrderRow = {
  id: string;
  status: string;
  total_cad: number | null;
  subtotal_cad: number | null;
  home_visit_fee_cad: number | null;
  created_at: string;
  updated_at: string;
  order_lines: Array<{
    id: string;
    quantity: number;
    unit_price_cad: number;
    test: { name: string; lab: { name: string } } | null;
    profile: { first_name: string; last_name: string } | null;
  }>;
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: ordersRaw } = await supabase
    .from("orders")
    .select(`
      id, status, total_cad, subtotal_cad, home_visit_fee_cad, created_at, updated_at,
      order_lines(
        id, quantity, unit_price_cad,
        test:tests(name, turnaround_display, lab:labs(name)),
        profile:patient_profiles(first_name, last_name)
      )
    `)
    .eq("account_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (ordersRaw ?? []) as unknown as OrderRow[];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          My <span style={{ color: "#c4973a" }}>Orders</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Track all your lab test orders.
        </p>
      </div>

      {orders.length === 0 ? (
        <div
          className="rounded-xl border px-6 py-16 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <Package
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "#2d6b35" }}
          />
          <p style={{ color: "#6ab04c" }}>No orders yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
            >
              <div
                className="px-6 py-4 border-b flex items-center gap-3"
                style={{ borderColor: "#2d6b35" }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-xs"
                      style={{ color: "#6ab04c" }}
                    >
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <OrderStatusBadge status={order.status as OrderStatus} />
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                    Placed {formatDate(order.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className="font-semibold"
                    style={{ color: "#c4973a" }}
                  >
                    {order.total_cad != null ? formatCurrency(order.total_cad) : "—"}
                  </p>
                  <p className="text-xs" style={{ color: "#6ab04c" }}>
                    Total
                  </p>
                </div>
              </div>

              <div>
                {order.order_lines.map((line, idx) => (
                  <div
                    key={line.id}
                    className="px-6 py-3 flex items-center gap-3"
                    style={{
                      borderTop: idx > 0 ? "1px solid #1a3d22" : "none",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "#ffffff" }}
                      >
                        {line.test?.name ?? "Unknown Test"}
                      </p>
                      <p className="text-xs" style={{ color: "#6ab04c" }}>
                        {line.test?.lab?.name && <span>{line.test.lab.name} · </span>}
                        For:{" "}
                        {line.profile
                          ? `${line.profile.first_name} ${line.profile.last_name}`
                          : "Unknown"}
                      </p>
                    </div>
                    <p
                      className="text-sm shrink-0"
                      style={{ color: "#c4973a" }}
                    >
                      {formatCurrency(line.unit_price_cad)}
                    </p>
                  </div>
                ))}
              </div>

              {(order.subtotal_cad != null || order.home_visit_fee_cad != null) && (
                <div
                  className="px-6 py-3 border-t space-y-1"
                  style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
                >
                  {order.subtotal_cad != null && (
                    <div
                      className="flex justify-between text-sm"
                      style={{ color: "#e8d5a3" }}
                    >
                      <span>Tests Subtotal</span>
                      <span>{formatCurrency(order.subtotal_cad)}</span>
                    </div>
                  )}
                  {order.home_visit_fee_cad != null &&
                    order.home_visit_fee_cad > 0 && (
                      <div
                        className="flex justify-between text-sm"
                        style={{ color: "#e8d5a3" }}
                      >
                        <span>Home Visit Fee</span>
                        <span>{formatCurrency(order.home_visit_fee_cad)}</span>
                      </div>
                    )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
