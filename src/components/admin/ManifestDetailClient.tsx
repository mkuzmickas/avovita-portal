"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Download,
  Truck,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { formatCurrency } from "@/lib/utils";
import type { Manifest } from "@/types/database";
import type { ManifestOrderRow } from "@/app/(admin)/admin/manifests/[id]/page";

interface Props {
  manifest: Manifest;
  initialOrders: ManifestOrderRow[];
}

function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ManifestDetailClient({ manifest, initialOrders }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<ManifestOrderRow[]>(initialOrders);
  const [shipTargetIds, setShipTargetIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const removeFromManifest = async (orderId: string) => {
    if (!confirm("Remove this order from the manifest?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/manifests/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: [orderId], manifest_id: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed: ${data.error ?? res.statusText}`);
        return;
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } finally {
      setBusy(false);
    }
  };

  const shipPending = shipTargetIds ?? [];

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/manifests"
          className="inline-flex items-center gap-1.5 text-sm mb-3 transition-colors"
          style={{ color: "#e8d5a3" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Manifests
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="font-heading text-3xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              <span style={{ color: "#c4973a" }}>{manifest.name}</span>
            </h1>
            <p className="mt-2 flex items-center gap-2 text-sm" style={{ color: "#e8d5a3" }}>
              <Calendar className="w-4 h-4" style={{ color: "#c4973a" }} />
              Ship date: {formatDateLong(manifest.ship_date)}
              <span style={{ color: "#2d6b35" }}>·</span>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                style={
                  manifest.status === "open"
                    ? {
                        backgroundColor: "rgba(141,198,63,0.125)",
                        color: "#8dc63f",
                        borderColor: "#8dc63f",
                      }
                    : {
                        backgroundColor: "rgba(196,151,58,0.125)",
                        color: "#c4973a",
                        borderColor: "#c4973a",
                      }
                }
              >
                {manifest.status === "open" ? "Open" : "Closed"}
              </span>
            </p>
            {manifest.notes && (
              <p className="mt-2 text-sm italic" style={{ color: "#e8d5a3" }}>
                {manifest.notes}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/admin/manifests/${manifest.id}/export`}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
              style={{
                backgroundColor: "transparent",
                borderColor: "#c4973a",
                color: "#c4973a",
              }}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </a>
            <button
              type="button"
              disabled={orders.length === 0}
              onClick={() => setShipTargetIds(orders.map((o) => o.id))}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                backgroundColor: "#c4973a",
                color: "#0a1a0d",
                opacity: orders.length === 0 ? 0.5 : 1,
              }}
            >
              <Truck className="w-4 h-4" />
              Mark All as Shipped
            </button>
          </div>
        </div>
      </div>

      {/* Orders table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {[
                  "Appointment",
                  "Client",
                  "Tests (SKU)",
                  "Fasting",
                  "Cost",
                  "Client Price",
                  "Margin",
                  "Status",
                  "",
                ].map((h, i) => (
                  <th
                    key={i}
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
              {orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-16 text-center"
                    style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
                  >
                    No orders assigned to this manifest yet. Add orders from the Orders page.
                  </td>
                </tr>
              ) : (
                orders.map((order, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const skus = order.lines
                    .map((l) => l.sku)
                    .filter((s): s is string => !!s)
                    .join(", ");
                  const fasting = order.lines.some((l) => l.fasting);
                  const margin =
                    order.cost_total != null && order.price_total != null
                      ? order.price_total - order.cost_total
                      : null;
                  return (
                    <tr
                      key={order.id}
                      style={{ backgroundColor: rowBg, borderTop: "1px solid #1a3d22" }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#ffffff" }}>
                        {order.appointment_date
                          ? formatDateLong(order.appointment_date)
                          : "—"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#ffffff" }}>
                        {order.patient_name}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#e8d5a3" }}>
                        {skus || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {fasting ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border"
                            style={{
                              backgroundColor: "rgba(196,151,58,0.125)",
                              color: "#c4973a",
                              borderColor: "#c4973a",
                            }}
                          >
                            Yes
                          </span>
                        ) : (
                          <span style={{ color: "#6ab04c" }}>No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#e8d5a3" }}>
                        {order.cost_total != null
                          ? formatCurrency(order.cost_total)
                          : "—"}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap font-semibold"
                        style={{ color: "#c4973a" }}
                      >
                        {order.price_total != null
                          ? formatCurrency(order.price_total)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold">
                        <MarginCell value={margin} />
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShipTargetIds([order.id])}
                            disabled={order.status === "shipped" || order.status === "complete"}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                            style={{
                              backgroundColor: "#c4973a",
                              color: "#0a1a0d",
                              opacity:
                                order.status === "shipped" ||
                                order.status === "complete"
                                  ? 0.4
                                  : 1,
                            }}
                          >
                            Mark Shipped
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromManifest(order.id)}
                            disabled={busy}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors"
                            style={{
                              backgroundColor: "transparent",
                              borderColor: "#2d6b35",
                              color: "#e8d5a3",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {shipTargetIds && (
        <ShipModal
          orderIds={shipPending}
          defaultShipDate={manifest.ship_date}
          onCancel={() => setShipTargetIds(null)}
          onShipped={(ids) => {
            setOrders((prev) =>
              prev.map((o) =>
                ids.includes(o.id) ? { ...o, status: "shipped" } : o
              )
            );
            setShipTargetIds(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function MarginCell({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: "#6ab04c" }}>—</span>;
  const color = value >= 50 ? "#8dc63f" : value >= 20 ? "#c4973a" : "#e05252";
  return <span style={{ color }}>{formatCurrency(value)}</span>;
}

// ─── Ship modal ───────────────────────────────────────────────────────

function ShipModal({
  orderIds,
  defaultShipDate,
  onCancel,
  onShipped,
}: {
  orderIds: string[];
  defaultShipDate: string;
  onCancel: () => void;
  onShipped: (ids: string[]) => void;
}) {
  const [tracking, setTracking] = useState("");
  const [shippingDate, setShippingDate] = useState(defaultShipDate);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!tracking.trim()) {
      setError("Tracking number is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders/ship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_ids: orderIds,
          tracking_number: tracking.trim(),
          shipping_date: shippingDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to mark shipped");
        return;
      }
      onShipped(orderIds);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 space-y-4"
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
            Mark {orderIds.length === 1 ? "Order" : `${orderIds.length} Orders`} as Shipped
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{ color: "#e8d5a3" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#e8d5a3" }}>
              FedEx Tracking Number <span style={{ color: "#e05252" }}>*</span>
            </label>
            <input
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              className="mf-input"
              placeholder="e.g. 794612345678"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#e8d5a3" }}>
              Shipping Date
            </label>
            <input
              type="date"
              value={shippingDate}
              onChange={(e) => setShippingDate(e.target.value)}
              className="mf-input"
            />
          </div>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg text-sm border"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.12)",
              borderColor: "#e05252",
              color: "#e05252",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              backgroundColor: "transparent",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !tracking.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              backgroundColor: "#c4973a",
              color: "#0a1a0d",
              opacity: submitting || !tracking.trim() ? 0.6 : 1,
            }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Marking…" : "Mark Shipped"}
          </button>
        </div>
      </div>
    </div>
  );
}
