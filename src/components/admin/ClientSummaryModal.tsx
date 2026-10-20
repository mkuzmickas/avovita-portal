"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, AlertCircle, ArrowUpRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ClientSummaryResponse } from "@/app/api/admin/clients/[accountId]/summary/route";

interface ClientSummaryModalProps {
  accountId: string;
  onClose: () => void;
}

/**
 * Admin pop-up that aggregates everything you'd want to see about a
 * client in one glance — name, DOB, email, phone, every order with the
 * SKUs ordered + price. Fired from any client-name link in the admin
 * surfaces (Clients tab, Orders tab, calendar chip, booking queue).
 */
export function ClientSummaryModal({
  accountId,
  onClose,
}: ClientSummaryModalProps) {
  const [data, setData] = useState<ClientSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/clients/${accountId}/summary`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((payload: ClientSummaryResponse) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load client");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // Lock body scroll + Escape closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  const nameFromProfile = data?.primary_profile
    ? `${data.primary_profile.first_name ?? ""} ${data.primary_profile.last_name ?? ""}`.trim()
    : "";
  const displayName =
    nameFromProfile ||
    (data?.account.waiver_signed_name ?? "").trim() ||
    (data?.account.email ?? "").trim() ||
    "Client";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={close}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: "#0f2614",
          borderColor: "#c4973a",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-start justify-between gap-4 border-b"
          style={{ borderColor: "#2d6b35", backgroundColor: "#1a3d22" }}
        >
          <div className="min-w-0">
            <h2
              className="font-heading text-xl font-semibold truncate"
              style={{
                color: "#ffffff",
                fontFamily:
                  '"Playfair Display", "Cormorant Garamond", Georgia, serif',
              }}
            >
              {displayName}
            </h2>
            {data?.account.email && (
              <p className="text-xs" style={{ color: "#8dc63f" }}>
                {data.account.email}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="p-1.5 rounded-md transition-colors shrink-0"
            style={{ color: "#c4973a", backgroundColor: "rgba(196,151,58,0.1)" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrolls on long order lists */}
        <div
          className="px-6 py-5 overflow-y-auto"
          style={{ flex: 1 }}
        >
          {loading && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "#8dc63f" }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          )}
          {error && !loading && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg border text-sm"
              style={{
                backgroundColor: "rgba(224,82,82,0.1)",
                borderColor: "#e05252",
                color: "#e05252",
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {data && !loading && !error && (
            <>
              {/* Identity block */}
              <dl
                className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-6"
                style={{ color: "#e8d5a3" }}
              >
                <IdRow
                  label="DOB"
                  value={
                    data.primary_profile?.date_of_birth
                      ? formatDate(data.primary_profile.date_of_birth)
                      : "—"
                  }
                />
                <IdRow
                  label="Sex"
                  value={
                    data.primary_profile?.biological_sex
                      ? capitalize(data.primary_profile.biological_sex)
                      : "—"
                  }
                />
                <IdRow
                  label="Phone"
                  value={data.primary_profile?.phone ?? "—"}
                />
                <IdRow
                  label="Member since"
                  value={formatDate(data.account.created_at)}
                />
                {(data.primary_profile?.address_line1 ||
                  data.primary_profile?.city ||
                  data.primary_profile?.postal_code) && (
                  <div className="col-span-2">
                    <dt className="text-xs" style={{ color: "#6ab04c" }}>
                      Address
                    </dt>
                    <dd>
                      {[
                        data.primary_profile.address_line1,
                        data.primary_profile.city,
                        data.primary_profile.province,
                        data.primary_profile.postal_code,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Orders */}
              <h3
                className="text-xs font-bold uppercase tracking-wider mb-3"
                style={{ color: "#c4973a", letterSpacing: "0.08em" }}
              >
                Orders ({data.orders.length})
              </h3>
              {data.orders.length === 0 ? (
                <p className="text-sm italic" style={{ color: "#6ab04c" }}>
                  No orders yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.orders.map((o) => (
                    <OrderCard key={o.id} order={o} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 flex items-center justify-between gap-3 border-t"
          style={{ borderColor: "#2d6b35", backgroundColor: "#0a1a0d" }}
        >
          {data && (
            <Link
              href={`/admin/patients/${data.account.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold"
              style={{ color: "#c4973a" }}
            >
              Open full client page
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={close}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{
              color: "#e8d5a3",
              borderColor: "#2d6b35",
              backgroundColor: "transparent",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "#6ab04c" }}>
        {label}
      </dt>
      <dd style={{ color: "#ffffff" }}>{value}</dd>
    </div>
  );
}

function OrderCard({
  order,
}: {
  order: ClientSummaryResponse["orders"][number];
}) {
  const skuList = order.lines
    .map((l) => (l.quantity > 1 ? `${l.sku ?? "?"} ×${l.quantity}` : l.sku))
    .filter(Boolean)
    .join(", ");
  return (
    <Link
      href={`/admin/orders?patient_id=${order.id.slice(0, 8)}`}
      className="block rounded-lg border p-3 transition-colors hover:brightness-110"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div
            className="font-mono text-sm font-semibold"
            style={{ color: "#c4973a" }}
          >
            #{order.short_id}
          </div>
          <div className="text-xs" style={{ color: "#8dc63f" }}>
            Ordered {formatDate(order.created_at)}
            {order.appointment_date
              ? ` · Appt ${formatDate(order.appointment_date)}`
              : ""}
            {" · "}
            <span style={{ color: "#e8d5a3" }}>{order.status}</span>
          </div>
        </div>
        <div
          className="text-sm font-semibold whitespace-nowrap av-nums"
          style={{ color: "#ffffff" }}
        >
          {formatCurrency(order.total_cad)}
        </div>
      </div>
      {order.lines.length > 0 && (
        <div
          className="text-xs mt-2 pt-2 border-t"
          style={{ color: "#e8d5a3", borderColor: "#2d6b35" }}
        >
          {order.lines.length === 1 && order.lines[0].test_name ? (
            <span>
              {order.lines[0].test_name}
              {order.lines[0].sku ? ` (${order.lines[0].sku})` : ""} ·{" "}
              {formatCurrency(order.lines[0].unit_price_cad)}
            </span>
          ) : (
            <span>
              {order.lines.length} tests · {skuList || "—"}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
