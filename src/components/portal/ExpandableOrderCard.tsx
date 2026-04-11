"use client";

import { useState } from "react";
import {
  ChevronDown,
  Calendar,
  ExternalLink,
  FileText,
  FlaskConical,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderTimeline } from "./OrderTimeline";
import type { OrderStatus } from "@/types/database";

const FLO_LABS_URL = "https://flo-labs.janeapp.com/";

export type PortalOrderLine = {
  id: string;
  quantity: number;
  unit_price_cad: number;
  test: {
    name: string;
    specimen_type: string | null;
    turnaround_display: string | null;
    lab: { name: string } | null;
  } | null;
  profile: { first_name: string; last_name: string } | null;
};

export type PortalOrder = {
  id: string;
  status: OrderStatus;
  total_cad: number | null;
  subtotal_cad: number | null;
  home_visit_fee_cad: number | null;
  notes: string | null;
  created_at: string;
  order_lines: PortalOrderLine[];
};

interface ExpandableOrderCardProps {
  order: PortalOrder;
}

export function ExpandableOrderCard({ order }: ExpandableOrderCardProps) {
  const [expanded, setExpanded] = useState(false);

  const testCount = order.order_lines.length;
  const needsBooking = order.status === "confirmed";

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      {/* Collapsed header (always visible, clickable) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 sm:px-6 py-4 flex items-center gap-3 sm:gap-4"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className="font-mono text-xs"
              style={{ color: "#6ab04c" }}
            >
              #{order.id.slice(0, 8).toUpperCase()}
            </span>
            <OrderStatusBadge status={order.status} />
            {needsBooking && (
              <span
                className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border tracking-wider"
                style={{
                  backgroundColor: "rgba(196, 151, 58, 0.125)",
                  borderColor: "#c4973a",
                  color: "#c4973a",
                }}
              >
                Action needed
              </span>
            )}
          </div>
          <p
            className="text-xs"
            style={{ color: "#6ab04c" }}
          >
            {formatDate(order.created_at)} · {testCount}{" "}
            {testCount === 1 ? "test" : "tests"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className="text-lg sm:text-xl font-semibold"
            style={{ color: "#c4973a" }}
          >
            {order.total_cad != null ? formatCurrency(order.total_cad) : "—"}
          </p>
        </div>
        <ChevronDown
          className="w-5 h-5 shrink-0 transition-transform duration-200"
          style={{
            color: "#c4973a",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="border-t"
          style={{ borderColor: "#2d6b35", backgroundColor: "#0f2614" }}
        >
          {/* Timeline */}
          <div className="px-4 sm:px-6 py-5 border-b" style={{ borderColor: "#2d6b35" }}>
            <OrderTimeline status={order.status} />
          </div>

          {/* FloLabs booking CTA when order is newly confirmed */}
          {needsBooking && (
            <div
              className="mx-4 sm:mx-6 my-5 rounded-xl border p-4 sm:p-5"
              style={{
                backgroundColor: "rgba(196, 151, 58, 0.08)",
                borderColor: "#c4973a",
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <Calendar
                  className="w-5 h-5 shrink-0 mt-0.5"
                  style={{ color: "#c4973a" }}
                />
                <div>
                  <h4
                    className="font-heading text-lg font-semibold mb-1"
                    style={{
                      color: "#ffffff",
                      fontFamily: '"Cormorant Garamond", Georgia, serif',
                    }}
                  >
                    Book your FloLabs home visit
                  </h4>
                  <p className="text-sm" style={{ color: "#e8d5a3" }}>
                    Your home collection visit needs to be scheduled. Click
                    below to book your FloLabs appointment.
                  </p>
                </div>
              </div>
              <a
                href={FLO_LABS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mf-btn-primary w-full sm:w-auto sm:inline-flex px-5 py-3"
              >
                <Calendar className="w-4 h-4" />
                Book FloLabs Appointment
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Order lines */}
          <div className="px-4 sm:px-6 py-5">
            <h4
              className="text-xs uppercase tracking-wider mb-3"
              style={{ color: "#6ab04c" }}
            >
              Tests in this order
            </h4>
            <ul className="space-y-3">
              {order.order_lines.map((line) => (
                <li
                  key={line.id}
                  className="rounded-lg border p-3"
                  style={{
                    backgroundColor: "#1a3d22",
                    borderColor: "#2d6b35",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                      style={{
                        backgroundColor: "#0f2614",
                        borderColor: "#2d6b35",
                      }}
                    >
                      <FlaskConical
                        className="w-4 h-4"
                        style={{ color: "#8dc63f" }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "#ffffff" }}
                      >
                        {line.test?.name ?? "Unknown test"}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "#e8d5a3" }}
                      >
                        {line.test?.lab?.name && (
                          <>
                            {line.test.lab.name}
                            {" · "}
                          </>
                        )}
                        For:{" "}
                        {line.profile
                          ? `${line.profile.first_name} ${line.profile.last_name}`
                          : "Unknown"}
                      </p>
                      <div
                        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs"
                        style={{ color: "#6ab04c" }}
                      >
                        {line.test?.specimen_type && (
                          <span>{line.test.specimen_type}</span>
                        )}
                        {line.test?.turnaround_display && (
                          <>
                            {line.test?.specimen_type && <span>·</span>}
                            <span>{line.test.turnaround_display}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <p
                      className="text-sm font-semibold shrink-0"
                      style={{ color: "#c4973a" }}
                    >
                      {formatCurrency(line.unit_price_cad)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Order notes */}
          {order.notes && (
            <div
              className="px-4 sm:px-6 py-4 border-t"
              style={{ borderColor: "#2d6b35" }}
            >
              <div className="flex items-start gap-2">
                <FileText
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: "#c4973a" }}
                />
                <div>
                  <p
                    className="text-xs uppercase tracking-wider mb-1"
                    style={{ color: "#6ab04c" }}
                  >
                    Notes
                  </p>
                  <p className="text-sm" style={{ color: "#e8d5a3" }}>
                    {order.notes}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Totals */}
          <div
            className="px-4 sm:px-6 py-4 border-t space-y-1"
            style={{ borderColor: "#2d6b35", backgroundColor: "#1a3d22" }}
          >
            {order.subtotal_cad != null && (
              <div
                className="flex justify-between text-sm"
                style={{ color: "#e8d5a3" }}
              >
                <span>Tests subtotal</span>
                <span>{formatCurrency(order.subtotal_cad)}</span>
              </div>
            )}
            {order.home_visit_fee_cad != null && order.home_visit_fee_cad > 0 && (
              <div
                className="flex justify-between text-sm"
                style={{ color: "#e8d5a3" }}
              >
                <span>Home visit fee</span>
                <span>{formatCurrency(order.home_visit_fee_cad)}</span>
              </div>
            )}
            <div
              className="flex justify-between text-base font-semibold pt-2 border-t mt-1"
              style={{ borderColor: "#2d6b35" }}
            >
              <span style={{ color: "#ffffff" }}>Total</span>
              <span style={{ color: "#c4973a" }}>
                {order.total_cad != null
                  ? `${formatCurrency(order.total_cad)} CAD`
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
