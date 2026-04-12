"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { AdminOrderStatusUpdater } from "@/components/AdminOrderStatusUpdater";
import type { OrderStatus } from "@/types/database";
import type { AdminOrderRow } from "@/app/(admin)/admin/orders/page";

interface AdminOrdersTableProps {
  orders: AdminOrderRow[];
  patientFilter: { label: string; accountId: string } | null;
}

const STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "confirmed",
  "collected",
  "shipped",
  "resulted",
  "complete",
  "cancelled",
];

export function AdminOrdersTable({
  orders,
  patientFilter,
}: AdminOrdersTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      // Status filter
      if (statusFilter !== "all" && order.status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      // Match by order ID prefix
      if (order.id.toLowerCase().includes(q)) return true;

      // Match by email
      if (order.account?.email?.toLowerCase().includes(q)) return true;

      // Match by patient name (any profile on the order)
      for (const line of order.order_lines) {
        if (!line.profile) continue;
        const fullName = `${line.profile.first_name} ${line.profile.last_name}`.toLowerCase();
        if (fullName.includes(q)) return true;
      }

      return false;
    });
  }, [orders, searchQuery, statusFilter]);

  const isEmptyDb = orders.length === 0;

  return (
    <>
      {/* Filter row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "#6ab04c" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient name, email, or order ID…"
            className="mf-input pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as OrderStatus | "all")
          }
          className="mf-input sm:max-w-[200px] cursor-pointer"
        >
          <option value="all" style={{ backgroundColor: "#0f2614" }}>
            All statuses
          </option>
          {STATUS_OPTIONS.map((s) => (
            <option
              key={s}
              value={s}
              style={{ backgroundColor: "#0f2614" }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Patient filter banner */}
      {patientFilter && (
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-4"
          style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        >
          <p className="text-sm flex-1" style={{ color: "#e8d5a3" }}>
            Showing orders for{" "}
            <span className="font-semibold" style={{ color: "#ffffff" }}>
              {patientFilter.label}
            </span>
          </p>
          <Link
            href="/admin/orders"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "#c4973a", border: "1px solid #c4973a" }}
          >
            <X className="w-3.5 h-3.5" />
            Clear filter
          </Link>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {["Order ID", "Date", "Patient", "Tests", "Total", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider"
                      style={{
                        color: "#c4973a",
                        fontFamily: '"DM Sans", sans-serif',
                      }}
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
                    className="px-6 py-16 text-center"
                    style={{
                      backgroundColor: "#0a1a0d",
                      color: "#6ab04c",
                    }}
                  >
                    {isEmptyDb
                      ? "No orders yet"
                      : "No orders match your search"}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const primary = order.order_lines[0]?.profile;
                  const patientName = primary
                    ? `${primary.first_name} ${primary.last_name}`
                    : (order.account?.email ?? "—");
                  const testCount = order.order_lines.length;
                  const testNames = order.order_lines
                    .map((l) => l.test?.name)
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <tr
                      key={order.id}
                      style={{
                        backgroundColor: rowBg,
                        borderTop: "1px solid #1a3d22",
                      }}
                    >
                      <td
                        className="px-5 py-4 font-mono text-xs whitespace-nowrap"
                        style={{ color: "#6ab04c" }}
                      >
                        #{order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td
                        className="px-5 py-4 text-xs whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {formatDate(order.created_at)}
                      </td>
                      <td
                        className="px-5 py-4"
                        style={{ color: "#ffffff" }}
                      >
                        {patientName}
                      </td>
                      <td
                        className="px-5 py-4 max-w-[260px]"
                        style={{ color: "#e8d5a3" }}
                      >
                        <p className="text-xs font-medium mb-0.5">
                          {testCount} {testCount === 1 ? "test" : "tests"}
                        </p>
                        <p className="text-xs truncate opacity-75">
                          {testNames || "—"}
                        </p>
                      </td>
                      <td
                        className="px-5 py-4 whitespace-nowrap"
                      >
                        <span
                          className="font-semibold"
                          style={{ color: "#c4973a" }}
                        >
                          {order.total_cad != null
                            ? formatCurrency(order.total_cad)
                            : "—"}
                        </span>
                        {order.discount_cad != null &&
                          order.discount_cad > 0 && (
                            <div
                              className="text-[10px] font-medium mt-0.5"
                              style={{ color: "#8dc63f" }}
                              title="Multi-test discount applied"
                            >
                              −{formatCurrency(order.discount_cad)} discount
                            </div>
                          )}
                      </td>
                      <td className="px-5 py-4">
                        <AdminOrderStatusUpdater
                          orderId={order.id}
                          currentStatus={order.status}
                          statusOptions={STATUS_OPTIONS}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-right" style={{ color: "#6ab04c" }}>
        Showing {filteredOrders.length} of {orders.length} orders
      </p>
    </>
  );
}
