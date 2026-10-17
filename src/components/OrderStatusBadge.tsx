"use client";

import type { OrderStatus } from "@/types/database";

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const statusConfig: Record<
  OrderStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: "Pending",
    bg: "rgba(196, 151, 58, 0.125)",
    text: "#C6A04B",
    border: "#C6A04B",
  },
  confirmed: {
    label: "Confirmed",
    bg: "rgba(59, 130, 246, 0.125)",
    text: "#93c5fd",
    border: "#3b82f6",
  },
  scheduled: {
    label: "Scheduled",
    bg: "rgba(196, 151, 58, 0.125)",
    text: "#C6A04B",
    border: "#C6A04B",
  },
  collected: {
    label: "Collected",
    bg: "rgba(141, 198, 63, 0.125)",
    text: "#88D45D",
    border: "#88D45D",
  },
  shipped: {
    label: "Shipped",
    bg: "rgba(59, 130, 246, 0.125)",
    text: "#93c5fd",
    border: "#3b82f6",
  },
  resulted: {
    label: "Resulted",
    bg: "rgba(141, 198, 63, 0.125)",
    text: "#88D45D",
    border: "#88D45D",
  },
  complete: {
    label: "Complete",
    bg: "rgba(45, 107, 53, 0.2)",
    text: "#88D45D",
    border: "#E5E2D4",
  },
  cancelled: {
    label: "Cancelled",
    bg: "rgba(224, 82, 82, 0.125)",
    text: "#e05252",
    border: "#e05252",
  },
};

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.pending;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className ?? ""}`}
      style={{
        backgroundColor: config.bg,
        color: config.text,
        borderColor: config.border,
      }}
    >
      {config.label}
    </span>
  );
}
