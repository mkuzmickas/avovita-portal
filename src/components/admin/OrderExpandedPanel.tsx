"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  ExternalLink,
  AlertTriangle,
  MapPin,
  CreditCard,
  FileText,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface OrderLine {
  id: string;
  line_type: string;
  test_id: string | null;
  supplement_id: string | null;
  resource_id: string | null;
  profile_id: string | null;
  quantity: number;
  unit_price_cad: number;
  test: { name: string; sku: string | null } | null;
  supplement: { name: string; sku: string | null } | null;
  resource: { title: string } | null;
  profile: { first_name: string; last_name: string } | null;
}

interface VisitGroup {
  id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  base_fee_cad: number;
  additional_person_count: number;
  additional_fee_cad: number;
  total_fee_cad: number;
}

interface OrderDetails {
  order: {
    id: string;
    subtotal_cad: number | null;
    discount_cad: number | null;
    home_visit_fee_cad: number | null;
    tax_cad: number | null;
    total_cad: number | null;
    notes: string | null;
    stripe_payment_intent_id: string | null;
    has_supplements: boolean;
    supplement_fulfillment: string | null;
    supplement_shipping_fee_cad: number;
    created_at: string;
    account: { id: string; email: string | null } | null;
  };
  lines: OrderLine[];
  visit_groups: VisitGroup[];
}

// Zone classification by city name
function classifyZone(city: string | null): {
  zone: string;
  expectedFee: number | null;
} {
  if (!city) return { zone: "Unknown", expectedFee: null };
  const c = city.trim().toLowerCase();
  if (c === "calgary") return { zone: "Calgary (Zone 1)", expectedFee: 85 };
  if (
    c === "chestermere" ||
    c === "airdrie" ||
    c === "cochrane" ||
    c === "okotoks"
  )
    return {
      zone: `${city} (Zone 2)`,
      expectedFee: 145,
    };
  return { zone: `${city} — manual review needed`, expectedFee: null };
}

export function OrderExpandedPanel({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/details`);
        if (!res.ok) throw new Error("Failed to load order details");
        const json = await res.json();
        if (!cancelled) setData(json as OrderDetails);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2
          className="w-5 h-5 animate-spin"
          style={{ color: "#c4973a" }}
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="flex items-center gap-2 p-4 text-sm"
        style={{ color: "#e05252" }}
      >
        <AlertTriangle className="w-4 h-4" />
        {error ?? "Failed to load order details"}
      </div>
    );
  }

  const { order, lines, visit_groups } = data;
  const visitGroup = visit_groups[0] ?? null;
  const zoneInfo = classifyZone(visitGroup?.city ?? null);

  // Discrepancy check
  const homeVisitFee = order.home_visit_fee_cad ?? 0;
  const hasDiscrepancy =
    zoneInfo.expectedFee !== null &&
    homeVisitFee > 0 &&
    Math.abs(homeVisitFee - zoneInfo.expectedFee) > 0.01;

  // Line totals
  const linesSubtotal = lines.reduce(
    (s, l) => s + l.unit_price_cad * l.quantity,
    0,
  );
  const discount = order.discount_cad ?? 0;
  const suppShipping = order.supplement_shipping_fee_cad ?? 0;
  const subtotalBeforeTax =
    linesSubtotal - discount + homeVisitFee + suppShipping;
  const estimatedGST =
    order.tax_cad ?? Math.round(subtotalBeforeTax * 0.05 * 100) / 100;
  const totalCharged = order.total_cad ?? subtotalBeforeTax + estimatedGST;

  const stripeUrl = order.stripe_payment_intent_id
    ? `https://dashboard.stripe.com/payments/${order.stripe_payment_intent_id}`
    : null;

  const orderIdShort = order.id.slice(0, 8).toUpperCase();

  return (
    <div
      className="px-6 py-5 space-y-5"
      style={{
        backgroundColor: "#0f2614",
        borderLeft: "3px solid #c4973a",
      }}
      role="region"
      aria-label={`Order details for #${orderIdShort}`}
    >
      {/* Section 6: Discrepancy warning */}
      {hasDiscrepancy && (
        <div
          className="flex items-start gap-3 rounded-lg border p-3"
          style={{
            backgroundColor: "rgba(217, 169, 57, 0.1)",
            borderColor: "#d4a84a",
          }}
        >
          <AlertTriangle
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: "#d4a84a" }}
          />
          <div className="text-sm" style={{ color: "#d4a84a" }}>
            <strong>Zone mismatch:</strong> charged{" "}
            {formatCurrency(homeVisitFee)} but address is in{" "}
            {zoneInfo.zone} (expected{" "}
            {formatCurrency(zoneInfo.expectedFee!)}). Difference:{" "}
            {formatCurrency(homeVisitFee - zoneInfo.expectedFee!)}.
          </div>
        </div>
      )}

      {/* Section 1: Line items */}
      <div>
        <h4
          className="text-xs font-bold uppercase tracking-wider mb-2"
          style={{ color: "#c4973a" }}
        >
          Line Items
        </h4>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #2d6b35" }}>
              {["Item", "Type", "Qty", "Unit Price", "Line Total"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-[11px] font-semibold uppercase"
                    style={{ color: "#6ab04c" }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const name =
                line.line_type === "test"
                  ? line.test?.name ?? "Unknown test"
                  : line.line_type === "supplement"
                    ? line.supplement?.name ?? "Unknown supplement"
                    : line.resource?.title ?? "Unknown resource";
              const sku =
                line.line_type === "test"
                  ? line.test?.sku
                  : line.line_type === "supplement"
                    ? line.supplement?.sku
                    : null;
              const lineTotal = line.unit_price_cad * line.quantity;

              return (
                <tr
                  key={line.id}
                  style={{ borderBottom: "1px solid #1a3d22" }}
                >
                  <td className="px-3 py-2" style={{ color: "#ffffff" }}>
                    <div>
                      {name}
                      {sku && (
                        <span
                          className="ml-2 font-mono text-[10px]"
                          style={{ color: "#6ab04c" }}
                        >
                          {sku}
                        </span>
                      )}
                    </div>
                    {line.profile && (
                      <div
                        className="text-[11px] mt-0.5 pl-2"
                        style={{ color: "#6ab04c" }}
                      >
                        {line.profile.first_name} {line.profile.last_name}
                      </div>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-xs capitalize"
                    style={{ color: "#e8d5a3" }}
                  >
                    {line.line_type}
                  </td>
                  <td className="px-3 py-2" style={{ color: "#e8d5a3" }}>
                    {line.quantity}
                  </td>
                  <td className="px-3 py-2" style={{ color: "#e8d5a3" }}>
                    {formatCurrency(line.unit_price_cad)}
                  </td>
                  <td
                    className="px-3 py-2 font-medium"
                    style={{ color: "#ffffff" }}
                  >
                    {formatCurrency(lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Section 2: Fees and adjustments */}
      <div>
        <h4
          className="text-xs font-bold uppercase tracking-wider mb-2"
          style={{ color: "#c4973a" }}
        >
          Fees &amp; Adjustments
        </h4>
        <div className="space-y-1 text-sm">
          {homeVisitFee > 0 && (
            <div className="flex justify-between" style={{ color: "#e8d5a3" }}>
              <span>Home visit fee ({zoneInfo.zone})</span>
              <span>{formatCurrency(homeVisitFee)}</span>
            </div>
          )}
          {suppShipping > 0 && (
            <div className="flex justify-between" style={{ color: "#e8d5a3" }}>
              <span>Supplement shipping</span>
              <span>{formatCurrency(suppShipping)}</span>
            </div>
          )}
          {discount > 0 && (
            <div
              className="flex justify-between font-medium"
              style={{ color: "#8dc63f" }}
            >
              <span>
                Multi-test discount
                {lines.filter((l) => l.line_type === "test").length >= 2
                  ? ` (${lines.filter((l) => l.line_type === "test").length} tests × $20 off)`
                  : ""}
              </span>
              <span>−{formatCurrency(discount)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Totals */}
      <div
        className="rounded-lg border p-4"
        style={{ backgroundColor: "#0a1a0d", borderColor: "#2d6b35" }}
      >
        <div className="space-y-1 text-sm">
          <div className="flex justify-between" style={{ color: "#e8d5a3" }}>
            <span>Subtotal (pre-tax)</span>
            <span>{formatCurrency(subtotalBeforeTax)}</span>
          </div>
          <div className="flex justify-between" style={{ color: "#e8d5a3" }}>
            <span>
              {order.tax_cad != null ? "GST" : "Estimated GST (5%)"}
            </span>
            <span>{formatCurrency(estimatedGST)}</span>
          </div>
          <div
            className="flex justify-between text-base font-bold pt-2 border-t"
            style={{ borderColor: "#2d6b35" }}
          >
            <span style={{ color: "#ffffff" }}>Total Charged</span>
            <span style={{ color: "#c4973a" }}>
              {formatCurrency(totalCharged)}
            </span>
          </div>
        </div>
      </div>

      {/* Section 4: Stripe metadata */}
      {order.stripe_payment_intent_id && (
        <div>
          <h4
            className="text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: "#c4973a" }}
          >
            <CreditCard
              className="w-3.5 h-3.5 inline mr-1"
              style={{ verticalAlign: "text-bottom" }}
            />
            Payment
          </h4>
          <div className="space-y-1 text-sm" style={{ color: "#e8d5a3" }}>
            <div className="flex items-center gap-2">
              <span>Payment Intent:</span>
              {stripeUrl ? (
                <a
                  href={stripeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs flex items-center gap-1"
                  style={{ color: "#93c5fd" }}
                >
                  {order.stripe_payment_intent_id}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="font-mono text-xs">
                  {order.stripe_payment_intent_id}
                </span>
              )}
            </div>
            <div>
              Charged:{" "}
              {new Date(order.created_at).toLocaleString("en-CA", {
                timeZone: "America/Edmonton",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              MT
            </div>
            <div>Currency: CAD</div>
          </div>
        </div>
      )}

      {/* Section 5: Collection details */}
      {visitGroup && (
        <div>
          <h4
            className="text-xs font-bold uppercase tracking-wider mb-2"
            style={{ color: "#c4973a" }}
          >
            <MapPin
              className="w-3.5 h-3.5 inline mr-1"
              style={{ verticalAlign: "text-bottom" }}
            />
            Collection
          </h4>
          <div className="text-sm" style={{ color: "#e8d5a3" }}>
            <p style={{ color: "#ffffff" }}>
              {visitGroup.address_line1}
            </p>
            {visitGroup.address_line2 && <p>{visitGroup.address_line2}</p>}
            <p>
              {visitGroup.city}, {visitGroup.province}{" "}
              {visitGroup.postal_code}
            </p>
            <p className="mt-1 text-xs" style={{ color: "#6ab04c" }}>
              Zone: {zoneInfo.zone}
            </p>
          </div>
          {order.notes && (
            <div className="mt-2">
              <p className="text-xs" style={{ color: "#6ab04c" }}>
                <FileText className="w-3 h-3 inline mr-1" />
                Notes: {order.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Section 7: Footer actions */}
      <div className="flex items-center gap-3 pt-2">
        {stripeUrl && (
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border"
            style={{
              color: "#c4973a",
              borderColor: "#2d6b35",
              backgroundColor: "transparent",
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View in Stripe
          </a>
        )}
      </div>
    </div>
  );
}
