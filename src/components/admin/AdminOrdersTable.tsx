"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Truck,
  ExternalLink,
  CheckCircle,
  Loader2,
  AlertCircle,
  Calendar,
  Package,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AdminOrderStatusUpdater } from "@/components/AdminOrderStatusUpdater";
import type { OrderStatus } from "@/types/database";
import type {
  AdminOrderRow,
  OpenManifestOption,
} from "@/app/(admin)/admin/orders/page";

interface AdminOrdersTableProps {
  orders: AdminOrderRow[];
  openManifests: OpenManifestOption[];
  patientFilter: { label: string; accountId: string } | null;
}

const STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "confirmed",
  "scheduled",
  "collected",
  "shipped",
  "resulted",
  "complete",
  "cancelled",
];

const SHIPPABLE_STATUSES: OrderStatus[] = ["confirmed", "scheduled", "collected"];

function fedexUrl(tracking: string) {
  return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
}

export function AdminOrdersTable({
  orders: initialOrders,
  openManifests,
  patientFilter,
}: AdminOrdersTableProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrderRow[]>(initialOrders);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipTracking, setShipTracking] = useState("");
  const [shipDate, setShipDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [shipping, setShipping] = useState(false);
  const [shipError, setShipError] = useState<string | null>(null);
  const [shipSuccess, setShipSuccess] = useState<string | null>(null);
  const [showManifestPicker, setShowManifestPicker] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const updateAppointment = async (orderId: string, dateStr: string) => {
    const value = dateStr || null;
    const res = await fetch(`/api/admin/orders/${orderId}/appointment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointment_date: value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed to set appointment: ${data.error ?? res.statusText}`);
      return;
    }
    const data = await res.json();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              appointment_date: value,
              status: (data.status ?? o.status) as OrderStatus,
            }
          : o
      )
    );
  };

  const assignToManifest = async (manifestId: string) => {
    setAssigning(true);
    try {
      const ids = Array.from(selected);
      const res = await fetch("/api/admin/manifests/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: ids, manifest_id: manifestId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed: ${data.error ?? res.statusText}`);
        return;
      }
      const manifest = openManifests.find((m) => m.id === manifestId);
      setOrders((prev) =>
        prev.map((o) =>
          ids.includes(o.id) ? { ...o, manifest_id: manifestId } : o
        )
      );
      setShipSuccess(
        `${ids.length} order${ids.length !== 1 ? "s" : ""} added to ${manifest?.name ?? "manifest"}`
      );
      setTimeout(() => setShipSuccess(null), 6000);
      setShowManifestPicker(false);
      setSelected(new Set());
    } finally {
      setAssigning(false);
    }
  };

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!q) return true;
      if (order.id.toLowerCase().includes(q)) return true;
      if (order.account?.email?.toLowerCase().includes(q)) return true;
      for (const line of order.order_lines) {
        if (!line.profile) continue;
        const fn = `${line.profile.first_name} ${line.profile.last_name}`.toLowerCase();
        if (fn.includes(q)) return true;
      }
      return false;
    });
  }, [orders, searchQuery, statusFilter]);

  const eligibleIds = useMemo(
    () =>
      new Set(
        filteredOrders
          .filter((o) => SHIPPABLE_STATUSES.includes(o.status))
          .map((o) => o.id)
      ),
    [filteredOrders]
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === eligibleIds.size && eligibleIds.size > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleIds));
    }
  };

  const handleShip = async () => {
    if (!shipTracking.trim()) {
      setShipError("FedEx tracking number is required.");
      return;
    }
    setShipping(true);
    setShipError(null);

    try {
      const res = await fetch("/api/orders/ship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_ids: Array.from(selected),
          tracking_number: shipTracking.trim(),
          shipping_date: shipDate,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Ship failed");
      }
      const data = await res.json();
      setShowShipModal(false);
      setSelected(new Set());
      setShipTracking("");
      setShipSuccess(
        `${data.shipped} order(s) marked as shipped. Patients notified.`
      );
      setTimeout(() => setShipSuccess(null), 6000);
      router.refresh();
    } catch (err) {
      setShipError(err instanceof Error ? err.message : "Failed to ship");
    } finally {
      setShipping(false);
    }
  };

  return (
    <>
      {/* Controls */}
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
            placeholder="Search by client name, email, or order ID…"
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
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
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
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ color: "#c4973a", border: "1px solid #c4973a" }}
          >
            <X className="w-3.5 h-3.5" />
            Clear filter
          </Link>
        </div>
      )}

      {/* Ship success banner */}
      {shipSuccess && (
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-4"
          style={{
            backgroundColor: "rgba(141, 198, 63, 0.12)",
            borderColor: "#8dc63f",
          }}
        >
          <CheckCircle className="w-5 h-5 shrink-0" style={{ color: "#8dc63f" }} />
          <p className="text-sm font-medium" style={{ color: "#8dc63f" }}>
            {shipSuccess}
          </p>
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
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      eligibleIds.size > 0 &&
                      selected.size === eligibleIds.size
                    }
                    onChange={toggleAll}
                    style={{ accentColor: "#c4973a" }}
                    className="w-4 h-4"
                    title="Select all shippable orders"
                  />
                </th>
                {[
                  "Order ID",
                  "Date",
                  "Appointment",
                  "Client",
                  "Tests",
                  "Total",
                  "Tracking",
                  "Status",
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
              {filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-16 text-center"
                    style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
                  >
                    {orders.length === 0
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
                  const isEligible = SHIPPABLE_STATUSES.includes(order.status);
                  const isChecked = selected.has(order.id);

                  return (
                    <tr
                      key={order.id}
                      style={{
                        backgroundColor: rowBg,
                        borderTop: "1px solid #1a3d22",
                      }}
                    >
                      <td className="px-3 py-4">
                        {isEligible ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOne(order.id)}
                            style={{ accentColor: "#c4973a" }}
                            className="w-4 h-4"
                          />
                        ) : (
                          <span className="w-4 h-4 block" />
                        )}
                      </td>
                      <td
                        className="px-4 py-4 font-mono text-xs whitespace-nowrap"
                        style={{ color: "#6ab04c" }}
                      >
                        #{order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td
                        className="px-4 py-4 text-xs whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="date"
                          value={order.appointment_date ?? ""}
                          onChange={(e) =>
                            updateAppointment(order.id, e.target.value)
                          }
                          className="rounded border px-2 py-1 text-xs"
                          style={{
                            backgroundColor: "#0f2614",
                            borderColor: order.appointment_date
                              ? "#c4973a"
                              : "#2d6b35",
                            color: order.appointment_date ? "#c4973a" : "#e8d5a3",
                            colorScheme: "dark",
                          }}
                        />
                      </td>
                      <td className="px-4 py-4" style={{ color: "#ffffff" }}>
                        {patientName}
                      </td>
                      <td
                        className="px-4 py-4 max-w-[220px]"
                        style={{ color: "#e8d5a3" }}
                      >
                        <p className="text-xs font-medium mb-0.5">
                          {testCount} {testCount === 1 ? "test" : "tests"}
                        </p>
                        <p className="text-xs truncate opacity-75">
                          {testNames || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="font-semibold" style={{ color: "#c4973a" }}>
                          {order.total_cad != null
                            ? formatCurrency(order.total_cad)
                            : "—"}
                        </span>
                        {order.discount_cad != null &&
                          order.discount_cad > 0 && (
                            <div
                              className="text-[10px] font-medium mt-0.5"
                              style={{ color: "#8dc63f" }}
                            >
                              −{formatCurrency(order.discount_cad)} discount
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {order.fedex_tracking_number ? (
                          <a
                            href={fedexUrl(order.fedex_tracking_number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-medium"
                            style={{ color: "#93c5fd" }}
                          >
                            <Truck className="w-3 h-3" />
                            {order.fedex_tracking_number}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="text-xs" style={{ color: "#6ab04c" }}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
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

      {/* Sticky selection action bar */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t"
          style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
        >
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
            <p className="text-sm flex-1" style={{ color: "#ffffff" }}>
              <span className="font-semibold" style={{ color: "#c4973a" }}>
                {selected.size}
              </span>{" "}
              order{selected.size !== 1 ? "s" : ""} selected
            </p>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="mf-btn-secondary px-4 py-2 text-xs"
            >
              Cancel Selection
            </button>
            <button
              type="button"
              disabled={openManifests.length === 0}
              onClick={() => setShowManifestPicker(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
              style={{
                backgroundColor: "transparent",
                borderColor: "#c4973a",
                color: "#c4973a",
                opacity: openManifests.length === 0 ? 0.5 : 1,
              }}
              title={
                openManifests.length === 0
                  ? "No open manifests — create one in Manifests"
                  : "Add selected orders to a manifest"
              }
            >
              <Package className="w-4 h-4" />
              Add to Manifest
            </button>
            <button
              type="button"
              onClick={() => setShowShipModal(true)}
              className="mf-btn-primary px-5 py-2"
            >
              <Truck className="w-4 h-4" />
              Ship Selected
            </button>
          </div>
        </div>
      )}

      {/* Add to Manifest picker modal */}
      {showManifestPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
          onClick={() => !assigning && setShowManifestPicker(false)}
        >
          <div
            className="rounded-2xl border w-full max-w-md p-6 space-y-4"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3
                className="font-heading text-xl font-semibold"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                Add to Manifest
              </h3>
              <button
                type="button"
                onClick={() => setShowManifestPicker(false)}
                disabled={assigning}
                aria-label="Close"
                style={{ color: "#e8d5a3" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs" style={{ color: "#e8d5a3" }}>
              Selecting a manifest will assign all{" "}
              <span style={{ color: "#c4973a" }}>{selected.size}</span> selected
              order{selected.size !== 1 ? "s" : ""}.
            </p>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {openManifests.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={assigning}
                  onClick={() => assignToManifest(m.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-sm transition-colors text-left"
                  style={{
                    backgroundColor: "#0f2614",
                    borderColor: "#2d6b35",
                    color: "#ffffff",
                  }}
                >
                  <span>{m.name}</span>
                  <span
                    className="flex items-center gap-1 text-xs"
                    style={{ color: "#c4973a" }}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {m.ship_date}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ship modal overlay */}
      {showShipModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
        >
          <div
            className="rounded-2xl border w-full max-w-lg p-6"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <h2
              className="font-heading text-2xl font-semibold mb-4"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Ship selected <span style={{ color: "#c4973a" }}>orders</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  FedEx Tracking Number{" "}
                  <span style={{ color: "#e05252" }}>*</span>
                </label>
                <input
                  type="text"
                  value={shipTracking}
                  onChange={(e) => setShipTracking(e.target.value)}
                  placeholder="e.g. 7489 2348 9823"
                  className="mf-input"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "#e8d5a3" }}
                >
                  Shipping Date
                </label>
                <input
                  type="date"
                  value={shipDate}
                  onChange={(e) => setShipDate(e.target.value)}
                  className="mf-input"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              <p className="text-xs" style={{ color: "#e8d5a3" }}>
                All {selected.size} selected order
                {selected.size !== 1 ? "s" : ""} will be marked as shipped
                and patients will be notified by email and SMS.
              </p>

              {shipError && (
                <div
                  className="flex items-center gap-2 p-3 rounded-lg text-sm border"
                  style={{
                    backgroundColor: "rgba(224, 82, 82, 0.12)",
                    borderColor: "#e05252",
                    color: "#e05252",
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {shipError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowShipModal(false);
                    setShipError(null);
                  }}
                  className="mf-btn-secondary flex-1 py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleShip}
                  disabled={shipping}
                  className="mf-btn-primary flex-1 py-2.5"
                >
                  {shipping && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {shipping ? "Shipping…" : "Save and Notify"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
