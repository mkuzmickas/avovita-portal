"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Save, Loader2, ExternalLink } from "lucide-react";
import type { CalendarAppointment } from "@/lib/calendar/fetch-appointments";

interface Props {
  appointment: CalendarAppointment;
  onClose: () => void;
}

/**
 * Reschedule an existing calendar appointment. Opened by clicking an
 * appointment chip on /admin/calendar. Pre-fills the current date,
 * time, and duration; saves via the same PATCH
 * /api/admin/orders/[id]/appointment endpoint the "Add appointment"
 * modal uses.
 *
 * Kept intentionally minimal — no cart changes, no patient edits.
 * This is strictly for date/time moves (client called to move Tuesday
 * → Thursday, FloLabs rearranged a route, etc.). The "View order"
 * link at the bottom preserves the previous click-through so admins
 * can still jump to the full order detail from the calendar.
 */
export function RescheduleAppointmentModal({ appointment, onClose }: Props) {
  const router = useRouter();
  const initial = calgaryLocalParts(new Date(appointment.appointmentAt));
  const initialDuration = appointment.appointmentEndAt
    ? Math.max(
        5,
        Math.round(
          (new Date(appointment.appointmentEndAt).getTime() -
            new Date(appointment.appointmentAt).getTime()) /
            60000,
        ),
      )
    : 30;

  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [durationMin, setDurationMin] = useState(initialDuration);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleSave = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Enter a valid date.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError("Enter a valid time.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const at = new Date(calgaryLocalISO(date, time));
      const end = new Date(at.getTime() + durationMin * 60 * 1000);
      const res = await fetch(
        `/api/admin/orders/${appointment.orderId}/appointment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointment_at: at.toISOString(),
            appointment_end_at: end.toISOString(),
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Save failed (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#E5E2D4",
          maxHeight: "calc(100dvh - 3rem)",
          overflowY: "auto",
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p
              className="text-xs uppercase tracking-wider font-semibold mb-1"
              style={{ color: "#C6A04B" }}
            >
              Reschedule
            </p>
            <h2
              id="reschedule-title"
              className="font-heading text-2xl font-semibold"
              style={{
                color: "#092819",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              {appointment.patientName}
            </h2>
            <p className="text-xs mt-1" style={{ color: "#154D31" }}>
              Currently: {formatCurrent(appointment.appointmentAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg"
            style={{ color: "#154D31" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label
              className="block text-xs font-semibold mb-1"
              style={{ color: "#154D31" }}
            >
              New date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mf-input"
              style={{ colorScheme: "light" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-semibold mb-1"
                style={{ color: "#154D31" }}
              >
                New time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mf-input"
                style={{ colorScheme: "light" }}
              />
            </div>
            <div>
              <label
                className="block text-xs font-semibold mb-1"
                style={{ color: "#154D31" }}
              >
                Duration (min)
              </label>
              <input
                type="number"
                min={5}
                max={180}
                step={5}
                value={durationMin}
                onChange={(e) =>
                  setDurationMin(Math.max(5, Number(e.target.value) || 30))
                }
                className="mf-input"
              />
            </div>
          </div>
        </div>

        {error && (
          <p
            className="mb-3 text-sm"
            style={{ color: "#e05252", fontWeight: 500 }}
          >
            {error}
          </p>
        )}

        <div className="flex flex-col sm:flex-row-reverse gap-2 mb-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold flex-1"
            style={{
              backgroundColor: "#154D31",
              color: "#FFFFFF",
              fontSize: "15px",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save reschedule
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold border"
            style={{
              backgroundColor: "transparent",
              color: "#154D31",
              borderColor: "#E5E2D4",
              fontSize: "15px",
            }}
          >
            Cancel
          </button>
        </div>

        <div className="pt-3 border-t" style={{ borderColor: "#E5E2D4" }}>
          <Link
            href={`/admin/orders?highlight=${appointment.orderId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: "#C6A04B" }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open full order
          </Link>
        </div>
      </div>
    </div>
  );
}

function calgaryLocalISO(date: string, time: string): string {
  // Build an ISO string whose UTC offset matches Calgary at the given
  // date (handles DST transitions). Same helper used by
  // AddAppointmentModal — keep in sync if ever changed.
  const [y, m, d] = date.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const raw =
    parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-06:00";
  const offset = raw.startsWith("GMT") ? raw.slice(3) : "-06:00";
  const [hh, mm] = time.split(":").map(Number);
  return `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${offset}`;
}

function calgaryLocalParts(d: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  let hh = parts.find((p) => p.type === "hour")?.value ?? "09";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (hh === "24") hh = "00";
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` };
}

function formatCurrent(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
