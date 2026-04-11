"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { createClient } from "@/lib/supabase/client";
import type { OrderStatus } from "@/types/database";
import { useRouter } from "next/navigation";

interface AdminOrderStatusUpdaterProps {
  orderId: string;
  currentStatus: OrderStatus;
  statusOptions: OrderStatus[];
}

export function AdminOrderStatusUpdater({
  orderId,
  currentStatus,
  statusOptions,
}: AdminOrderStatusUpdaterProps) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  const handleChange = async (newStatus: OrderStatus) => {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    setStatus(newStatus);
    setSaving(false);
    setEditing(false);
    router.refresh();
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 group"
        title="Click to change status"
      >
        <OrderStatusBadge status={status} />
        <span
          className="text-xs transition-colors"
          style={{ color: "#6ab04c" }}
        >
          ▾
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {saving ? (
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#c4973a" }} />
      ) : (
        <select
          autoFocus
          value={status}
          onChange={(e) => handleChange(e.target.value as OrderStatus)}
          onBlur={() => setEditing(false)}
          className="text-xs rounded-lg px-2 py-1 focus:outline-none border"
          style={{
            color: "#ffffff",
            backgroundColor: "#0f2614",
            borderColor: "#c4973a",
          }}
        >
          {statusOptions.map((s) => (
            <option
              key={s}
              value={s}
              style={{ backgroundColor: "#0f2614", color: "#ffffff" }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
