"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  X,
  CreditCard,
  Pencil,
  Trash2,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ClientNameLink } from "./ClientNameLink";
import type { ClinicAppointment } from "@/app/(admin)/admin/clinic/page";

// 15-minute lane grid. Default clinic day = 08:00 to 18:00 (40 slots).
// Easy to make configurable later; hardcoded here keeps the first cut
// shippable without a settings table round-trip.
const DAY_START_H = 8;
const DAY_END_H = 18;
const SLOT_MINUTES = 15;

interface Props {
  dateIso: string;
  appointments: ClinicAppointment[];
}

type SlotKey = string; // "HH:MM"

type SlotStack = {
  slot: SlotKey;
  minutesSinceStart: number;
  appts: ClinicAppointment[];
};

export function ClinicDayClient({ dateIso, appointments }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const slots = useMemo<SlotKey[]>(() => {
    const out: SlotKey[] = [];
    for (
      let m = DAY_START_H * 60;
      m < DAY_END_H * 60;
      m += SLOT_MINUTES
    ) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      out.push(`${pad(h)}:${pad(mm)}`);
    }
    return out;
  }, []);

  // Bucket appointments into their start slot. Appointments whose
  // minutes don't align to a 15-min boundary snap DOWN to the slot
  // they start in — they still get positioned by their offset in the
  // UI so the visual time matches.
  const stacks = useMemo<Record<SlotKey, SlotStack>>(() => {
    const bySlot: Record<SlotKey, SlotStack> = {};
    for (const a of appointments) {
      const d = new Date(a.appointment_at);
      // Calgary local time via Intl formatter — avoids a wrong-UTC
      // bucket in daylight-savings transitions.
      const timeParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Edmonton",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const h = parseInt(
        timeParts.find((p) => p.type === "hour")?.value ?? "0",
        10,
      );
      const m = parseInt(
        timeParts.find((p) => p.type === "minute")?.value ?? "0",
        10,
      );
      const totalMin = h * 60 + m;
      const slotMin =
        Math.floor(totalMin / SLOT_MINUTES) * SLOT_MINUTES;
      const slot = `${pad(Math.floor(slotMin / 60))}:${pad(slotMin % 60)}`;
      const offsetWithinSlot = totalMin - slotMin;
      const stack = bySlot[slot] ?? {
        slot,
        minutesSinceStart: offsetWithinSlot,
        appts: [],
      };
      stack.appts.push(a);
      bySlot[slot] = stack;
    }
    return bySlot;
  }, [appointments]);

  const prevDate = shiftDate(dateIso, -1);
  const nextDate = shiftDate(dateIso, 1);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Edmonton",
  });

  const selected =
    selectedId != null ? appointments.find((a) => a.id === selectedId) : null;

  const reschedule = async (orderId: string) => {
    const input = prompt(
      "New appointment time (YYYY-MM-DD HH:MM, 24-hour, Calgary local).\nLeave blank to cancel.",
      selected
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Edmonton",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
            .format(new Date(selected.appointment_at))
            .replace(",", "")
            .replace(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/, "$1-$2-$3 $4:$5")
        : "",
    );
    if (!input) return;
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!m) {
      alert("Format must be YYYY-MM-DD HH:MM");
      return;
    }
    const [, y, mo, d, h, mi] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:00-06:00`;
    setRescheduling(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/appointment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_at: iso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } finally {
      setRescheduling(false);
    }
  };

  const cancel = async (orderId: string) => {
    if (!confirm("Mark this appointment as cancelled? The order remains.")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/appointment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_date: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `Failed (${res.status})`);
        return;
      }
      setSelectedId(null);
      router.refresh();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left — day grid */}
      <div className="flex-1 min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1
              className="font-heading text-3xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily:
                  '"Playfair Display", "Cormorant Garamond", Georgia, serif',
              }}
            >
              Clinic <span style={{ color: "#c4973a" }}>Day</span>
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#8dc63f" }}>
              In-clinic Tuesday appointments · 15-minute lanes · admin pilot
              (not customer-facing yet).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/clinic?date=${prevDate}`}
              className="inline-flex items-center p-2 rounded-lg border transition-colors"
              style={{
                borderColor: "#2d6b35",
                color: "#e8d5a3",
                backgroundColor: "transparent",
              }}
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <input
              type="date"
              value={dateIso}
              onChange={(e) => {
                const v = e.target.value;
                if (v) router.push(`/admin/clinic?date=${v}`);
              }}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#2d6b35",
                color: "#e8d5a3",
                colorScheme: "dark",
              }}
            />
            <Link
              href={`/admin/clinic?date=${nextDate}`}
              className="inline-flex items-center p-2 rounded-lg border transition-colors"
              style={{
                borderColor: "#2d6b35",
                color: "#e8d5a3",
                backgroundColor: "transparent",
              }}
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
            {dateIso !== today && (
              <Link
                href={`/admin/clinic?date=${today}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm transition-colors"
                style={{
                  borderColor: "#c4973a",
                  color: "#c4973a",
                  backgroundColor: "transparent",
                }}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Today
              </Link>
            )}
          </div>
        </div>

        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
        >
          <div
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b flex items-center justify-between gap-3"
            style={{
              color: "#c4973a",
              letterSpacing: "0.08em",
              borderColor: "#1a3d22",
              backgroundColor: "#1a3d22",
            }}
          >
            <span>
              {new Date(`${dateIso}T12:00:00-06:00`).toLocaleDateString(
                "en-CA",
                {
                  timeZone: "America/Edmonton",
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                },
              )}
            </span>
            <span style={{ color: "#8dc63f" }}>
              {appointments.length} appt{appointments.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="divide-y" style={{ borderColor: "#1a3d22" }}>
            {slots.map((slot) => {
              const stack = stacks[slot];
              return (
                <div
                  key={slot}
                  className="flex items-stretch min-h-[48px]"
                  style={{ borderColor: "#1a3d22" }}
                >
                  {/* Time gutter */}
                  <div
                    className="w-20 flex items-start justify-end pr-3 pt-2 text-xs font-mono"
                    style={{
                      color: "#6ab04c",
                      backgroundColor: "#0a1a0d",
                      borderRight: "1px solid #1a3d22",
                    }}
                  >
                    {formatSlotLabel(slot)}
                  </div>
                  {/* Lane */}
                  <div className="flex-1 relative px-2 py-1">
                    {stack ? (
                      <div className="flex flex-col gap-1">
                        {stack.appts.map((a, i) => (
                          <AppointmentChip
                            key={a.id}
                            appt={a}
                            stackIndex={i}
                            stackSize={stack.appts.length}
                            selected={selectedId === a.id}
                            onClick={() =>
                              setSelectedId((prev) =>
                                prev === a.id ? null : a.id,
                              )
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptySlotButton slot={slot} dateIso={dateIso} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right — side panel */}
      <aside className="w-full lg:w-[380px] shrink-0">
        {selected ? (
          <AppointmentPanel
            appt={selected}
            onClose={() => setSelectedId(null)}
            onReschedule={() => reschedule(selected.id)}
            onCancel={() => cancel(selected.id)}
            cancelling={cancelling}
            rescheduling={rescheduling}
          />
        ) : (
          <QuickActionsCard dateIso={dateIso} />
        )}
      </aside>
    </div>
  );
}

// ─── Appointment chip ──────────────────────────────────────────────────

function AppointmentChip({
  appt,
  stackIndex,
  stackSize,
  selected,
  onClick,
}: {
  appt: ClinicAppointment;
  stackIndex: number;
  stackSize: number;
  selected: boolean;
  onClick: () => void;
}) {
  const mode = appt.collection_mode ?? "mobile";
  const palette =
    mode === "clinic"
      ? { bg: "rgba(196,151,58,0.15)", border: "#c4973a", text: "#c4973a" }
      : mode === "out_of_town"
        ? { bg: "rgba(141,198,63,0.12)", border: "#8dc63f", text: "#8dc63f" }
        : { bg: "rgba(21,77,49,0.4)", border: "#2d6b35", text: "#e8d5a3" };

  const time = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(appt.appointment_at));

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border px-3 py-2 transition-colors"
      style={{
        backgroundColor: palette.bg,
        borderColor: selected ? "#c4973a" : palette.border,
        borderWidth: selected ? 2 : 1,
      }}
      title={
        stackSize > 1
          ? `Stacked ${stackIndex + 1} of ${stackSize} at this slot`
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="text-sm font-semibold truncate"
            style={{ color: "#ffffff" }}
          >
            {appt.client_label}
          </div>
          <div
            className="text-xs mt-0.5 truncate"
            style={{ color: palette.text }}
          >
            {time} · {mode}
            {appt.test_summaries.length > 0 && (
              <span style={{ color: "#8dc63f" }}>
                {" · "}
                {appt.test_summaries.slice(0, 3).join(", ")}
                {appt.test_summaries.length > 3
                  ? ` +${appt.test_summaries.length - 3}`
                  : ""}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-[10px] font-mono"
            style={{ color: "#8dc63f" }}
          >
            #{appt.short_id}
          </div>
          {appt.total_cad > 0 && (
            <div
              className="text-xs font-semibold av-nums"
              style={{ color: "#ffffff" }}
            >
              {formatCurrency(appt.total_cad)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Empty slot — click to create a new appointment ───────────────────

function EmptySlotButton({
  slot,
  dateIso,
}: {
  slot: SlotKey;
  dateIso: string;
}) {
  return (
    <Link
      href={`/admin/clinic/new?date=${dateIso}&time=${slot}`}
      className="block w-full h-full min-h-[40px] rounded-lg transition-colors group"
      style={{
        backgroundColor: "transparent",
        border: "1px dashed transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(196,151,58,0.06)";
        e.currentTarget.style.borderColor = "#2d6b35";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      <span
        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs flex items-center justify-center h-full gap-1"
        style={{ color: "#8dc63f" }}
      >
        <Plus className="w-3 h-3" />
        New at {formatSlotLabel(slot)}
      </span>
    </Link>
  );
}

// ─── Appointment side panel ───────────────────────────────────────────

function AppointmentPanel({
  appt,
  onClose,
  onReschedule,
  onCancel,
  cancelling,
  rescheduling,
}: {
  appt: ClinicAppointment;
  onClose: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  cancelling: boolean;
  rescheduling: boolean;
}) {
  const time = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(appt.appointment_at));
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between gap-2 border-b"
        style={{ borderColor: "#2d6b35", backgroundColor: "#1a3d22" }}
      >
        <div
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: "#c4973a", letterSpacing: "0.08em" }}
        >
          Appointment · {time}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded transition-colors"
          style={{ color: "#8dc63f" }}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div>
          <div className="text-xs" style={{ color: "#6ab04c" }}>
            Client
          </div>
          <div className="text-sm" style={{ color: "#ffffff" }}>
            <ClientNameLink accountId={appt.account?.id}>
              {appt.client_label}
            </ClientNameLink>
          </div>
          {appt.account?.email && (
            <div className="text-xs" style={{ color: "#8dc63f" }}>
              {appt.account.email}
            </div>
          )}
          {appt.client_dob && (
            <div
              className="text-xs mt-1 flex items-center gap-2 font-mono select-all"
              style={{ color: "#c4973a" }}
              title="Copy DOB for Mayo label"
            >
              <span
                className="text-[10px] uppercase tracking-wider font-sans"
                style={{ color: "#6ab04c", letterSpacing: "0.08em" }}
              >
                DOB
              </span>
              <span style={{ color: "#ffffff" }}>
                {formatDate(appt.client_dob)}
              </span>
            </div>
          )}
        </div>
        <div
          className="rounded-lg border p-3"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <div className="text-xs mb-1" style={{ color: "#6ab04c" }}>
            Tests on this appointment ({appt.test_summaries.length})
          </div>
          {appt.test_summaries.length === 0 ? (
            <div className="text-xs italic" style={{ color: "#8dc63f" }}>
              No tests yet. Add some before checkout.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {appt.test_summaries.map((t, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded-full font-mono"
                  style={{
                    backgroundColor: "rgba(141,198,63,0.1)",
                    color: "#8dc63f",
                    border: "1px solid rgba(141,198,63,0.3)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div
          className="flex items-center justify-between text-xs"
          style={{ color: "#e8d5a3" }}
        >
          <span>Mode: {appt.collection_mode ?? "mobile"}</span>
          <span>
            Status: <strong style={{ color: "#ffffff" }}>{appt.status}</strong>
          </span>
          <span className="av-nums" style={{ color: "#ffffff" }}>
            {formatCurrency(appt.total_cad)}
          </span>
        </div>
      </div>
      <div
        className="px-4 py-3 flex flex-col gap-2 border-t"
        style={{ borderColor: "#2d6b35", backgroundColor: "#0a1a0d" }}
      >
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{
              backgroundColor: "rgba(196,151,58,0.15)",
              color: "#c4973a",
              border: "1px solid #c4973a",
              opacity: 0.55,
              cursor: "not-allowed",
            }}
            title="Phase 2 — reuse the QuoteBuilder test picker"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Add tests (soon)
          </button>
          <Link
            href={`/admin/orders?patient_id=${appt.account?.id ?? ""}`}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors"
            style={{
              borderColor: "#2d6b35",
              color: "#e8d5a3",
              backgroundColor: "transparent",
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Open order
          </Link>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReschedule}
            disabled={rescheduling}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors"
            style={{
              borderColor: "#c4973a",
              color: "#c4973a",
              backgroundColor: "transparent",
              opacity: rescheduling ? 0.6 : 1,
            }}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            {rescheduling ? "Saving…" : "Reschedule"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors"
            style={{
              borderColor: "#e05252",
              color: "#e05252",
              backgroundColor: "transparent",
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        </div>
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
          style={{
            backgroundColor: "#c4973a",
            color: "#0a1a0d",
            opacity: 0.55,
            cursor: "not-allowed",
          }}
          title="Phase 2 — admin Stripe PaymentElement checkout"
        >
          <CreditCard className="w-3.5 h-3.5" />
          Charge card (Phase 2)
        </button>
      </div>
    </div>
  );
}

function QuickActionsCard({ dateIso }: { dateIso: string }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
    >
      <div
        className="px-4 py-3 border-b text-xs font-bold uppercase tracking-wider"
        style={{
          color: "#c4973a",
          letterSpacing: "0.08em",
          borderColor: "#1a3d22",
          backgroundColor: "#1a3d22",
        }}
      >
        Clinic day actions
      </div>
      <div className="px-4 py-4 space-y-2">
        <p className="text-xs" style={{ color: "#8dc63f" }}>
          Click any appointment on the grid for details, or click an empty
          slot to book someone in. Side panel will populate here.
        </p>
        <Link
          href={`/admin/clinic/new?date=${dateIso}`}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <Plus className="w-4 h-4" />
          New appointment
        </Link>
        <div
          className="text-[11px] italic"
          style={{ color: "#6ab04c" }}
        >
          Phase 2 wires test-picker and card charge. Reschedule and cancel
          work today.
        </div>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function formatSlotLabel(slot: SlotKey): string {
  const [h, m] = slot.split(":").map((s) => parseInt(s, 10));
  const d = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
