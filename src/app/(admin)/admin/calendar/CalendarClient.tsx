"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarPlus } from "lucide-react";
import type { CalendarAppointment } from "@/lib/calendar/fetch-appointments";

interface Props {
  anchorISO: string;
  activeView: "week" | "month";
  appointments: CalendarAppointment[];
  /**
   * Base URL used for calendar navigation (view/date changes) and for
   * appointment-chip click-through. Defaults to the admin route; the
   * FloLabs token-gated /calendar page passes its own path here so
   * navigation preserves the token query.
   */
  basePath?: string;
  /**
   * Extra query params to append to every navigation URL (e.g. the
   * `token=<hex>` used on the public /calendar route).
   */
  extraQuery?: string;
  /**
   * When true, appointment chips render as inert divs (no order link)
   * and the "Log FloLabs booking" button is hidden. Used by the
   * FloLabs-facing view where the audience must not reach the rest
   * of the admin portal.
   */
  readOnly?: boolean;
}

const HOUR_SLOTS = [7, 8, 9, 10, 11, 12, 13, 14, 15]; // 7 AM – 3 PM

export function CalendarClient({
  anchorISO,
  activeView,
  appointments,
  basePath = "/admin/calendar",
  extraQuery = "",
  readOnly = false,
}: Props) {
  const router = useRouter();

  const jumpTo = (date: string, view: "week" | "month" = activeView) => {
    const suffix = extraQuery ? `&${extraQuery}` : "";
    router.push(`${basePath}?date=${date}&view=${view}${suffix}`);
  };

  return (
    <>
      {/* Header controls: view toggle + nav + new booking */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div
          className="inline-flex rounded-lg overflow-hidden border"
          style={{ borderColor: "#2d6b35" }}
        >
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => jumpTo(anchorISO, v)}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                backgroundColor: activeView === v ? "#c4973a" : "transparent",
                color: activeView === v ? "#0a1a0d" : "#e8d5a3",
                border: 0,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {v}
            </button>
          ))}
        </div>

        <NavArrow
          direction="prev"
          currentISO={anchorISO}
          view={activeView}
          onJump={jumpTo}
        />
        <div style={{ color: "#ffffff", fontSize: "16px", fontWeight: 500 }}>
          {activeView === "week"
            ? formatWeekLabel(anchorISO)
            : formatMonthLabel(anchorISO)}
        </div>
        <NavArrow
          direction="next"
          currentISO={anchorISO}
          view={activeView}
          onJump={jumpTo}
        />

        <button
          type="button"
          onClick={() => jumpTo(todayCalgaryISO())}
          style={{
            marginLeft: "auto",
            padding: "8px 12px",
            border: "1px solid #2d6b35",
            borderRadius: "8px",
            backgroundColor: "transparent",
            color: "#e8d5a3",
            fontSize: "13px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Today
        </button>

        {!readOnly && (
          <Link
            href="/admin/bookings/new"
            className="inline-flex items-center gap-2"
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              backgroundColor: "#c4973a",
              color: "#0a1a0d",
              fontSize: "13px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <CalendarPlus className="w-4 h-4" />
            Log FloLabs booking
          </Link>
        )}
      </div>

      {activeView === "week" ? (
        <WeekView
          anchorISO={anchorISO}
          appointments={appointments}
          readOnly={readOnly}
        />
      ) : (
        <MonthView
          anchorISO={anchorISO}
          appointments={appointments}
          onJumpToDay={(iso) => jumpTo(iso, "week")}
        />
      )}
    </>
  );
}

/* ─── Week view ────────────────────────────────────────────────── */

function WeekView({
  anchorISO,
  appointments,
  readOnly,
}: {
  anchorISO: string;
  appointments: CalendarAppointment[];
  readOnly: boolean;
}) {
  const weekDays = useMemo(() => weekDaysFor(anchorISO), [anchorISO]);
  const byDayHour = useMemo(() => groupByDayHour(appointments), [appointments]);
  const todayISO = todayCalgaryISO();

  return (
    <div
      style={{
        border: "1px solid #2d6b35",
        borderRadius: "10px",
        overflow: "hidden",
        backgroundColor: "#0f2614",
      }}
    >
      {/* Day header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `60px repeat(7, 1fr)`,
          borderBottom: "1px solid #2d6b35",
          backgroundColor: "#1a3d22",
        }}
      >
        <div />
        {weekDays.map((d) => (
          <div
            key={d.iso}
            style={{
              padding: "10px 12px",
              textAlign: "left",
              borderLeft: "1px solid #2d6b35",
              color: d.iso === todayISO ? "#c4973a" : "#e8d5a3",
              fontWeight: d.iso === todayISO ? 700 : 500,
              fontSize: "13px",
            }}
          >
            <div style={{ fontSize: "11px", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {d.label}
            </div>
            <div style={{ fontSize: "16px" }}>{d.dayOfMonth}</div>
          </div>
        ))}
      </div>

      {/* Hour rows — variable height. If any day in this hour has an
          appointment we let the row grow; otherwise it collapses to a
          slim spacer so the week is compact and appointments read
          bigger. */}
      {HOUR_SLOTS.map((hour) => {
        const rowHasAny = weekDays.some(
          (d) => (byDayHour.get(`${d.iso}-${hour}`) ?? []).length > 0,
        );
        return (
          <div
            key={hour}
            style={{
              display: "grid",
              gridTemplateColumns: `60px repeat(7, 1fr)`,
              borderTop: "1px solid #1f4a28",
              minHeight: rowHasAny ? "88px" : "28px",
            }}
          >
            <div
              style={{
                padding: rowHasAny ? "8px 12px 4px" : "4px 12px",
                fontSize: "11px",
                color: rowHasAny ? "#c4973a" : "#5a705f",
                textAlign: "right",
                fontWeight: rowHasAny ? 600 : 400,
              }}
            >
              {formatHour(hour)}
            </div>
            {weekDays.map((d) => {
              const key = `${d.iso}-${hour}`;
              const list = byDayHour.get(key) ?? [];
              return (
                <div
                  key={d.iso}
                  style={{
                    borderLeft: "1px solid #1f4a28",
                    padding: rowHasAny ? "4px" : "0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {list.map((a) => (
                    <AppointmentChip
                      key={a.orderId}
                      appointment={a}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function AppointmentChip({
  appointment: a,
  readOnly,
}: {
  appointment: CalendarAppointment;
  readOnly: boolean;
}) {
  const time = formatTime(a.appointmentAt);
  const codes = a.tests.map((t) => t.sku ?? shortCode(t.name));
  const dobShort = a.patientDob ? formatDob(a.patientDob) : null;
  const sexShort = a.patientSex ? formatSex(a.patientSex) : null;
  const chipStyle: React.CSSProperties = {
    display: "block",
    padding: "8px 10px",
    borderRadius: "8px",
    backgroundColor: a.isKitOnly
      ? "rgba(196, 151, 58, 0.18)" // light orange (kit)
      : "rgba(141, 198, 63, 0.16)", // light green (visit)
    border: `1px solid ${a.isKitOnly ? "#c4973a" : "#8dc63f"}`,
    color: "#ffffff",
    fontSize: "13px",
    lineHeight: 1.35,
    textDecoration: "none",
  };
  const chipTitle = `${a.patientName} · DOB ${dobShort ?? "?"} · ${time} · ${a.tests.map((t) => t.name).join(", ")}`;
  const inner = (
    <>
      <div style={{ fontWeight: 700, fontSize: "14px" }}>{a.patientName}</div>
      <div
        style={{
          opacity: 0.85,
          fontSize: "11px",
          marginTop: "2px",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {time}
        {dobShort && ` · DOB ${dobShort}`}
        {sexShort && ` · ${sexShort}`}
      </div>
      {codes.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "3px",
            marginTop: "6px",
          }}
        >
          {codes.map((code, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                padding: "1px 6px",
                borderRadius: "4px",
                backgroundColor: "rgba(0,0,0,0.28)",
                fontSize: "11px",
                fontWeight: 600,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                letterSpacing: "0.02em",
              }}
            >
              {code}
            </span>
          ))}
        </div>
      )}
    </>
  );

  if (readOnly) {
    return (
      <div style={chipStyle} title={chipTitle}>
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={`/admin/orders?highlight=${a.orderId}`}
      style={chipStyle}
      title={chipTitle}
    >
      {inner}
    </Link>
  );
}

function formatDob(iso: string): string {
  // YYYY-MM-DD -> DD MMM YY (compact for chip). Safe with any DB format
  // that starts with YYYY-MM-DD.
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mm = months[parseInt(m, 10) - 1] ?? m;
  return `${d} ${mm} ${y.slice(2)}`;
}

function formatSex(s: string): string {
  const first = s[0]?.toUpperCase();
  if (first === "F" || first === "M" || first === "I" || first === "O") return first;
  return s.slice(0, 1).toUpperCase();
}

/* ─── Month view ───────────────────────────────────────────────── */

function MonthView({
  anchorISO,
  appointments,
  onJumpToDay,
}: {
  anchorISO: string;
  appointments: CalendarAppointment[];
  onJumpToDay: (iso: string) => void;
}) {
  const days = useMemo(() => monthDaysFor(anchorISO), [anchorISO]);
  const byDay = useMemo(() => groupByDay(appointments), [appointments]);
  const todayISO = todayCalgaryISO();

  return (
    <div
      style={{
        border: "1px solid #2d6b35",
        borderRadius: "10px",
        overflow: "hidden",
        backgroundColor: "#0f2614",
      }}
    >
      {/* Day-of-week header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(7, 1fr)`,
          borderBottom: "1px solid #2d6b35",
          backgroundColor: "#1a3d22",
        }}
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            style={{
              padding: "10px",
              fontSize: "11px",
              color: "#c4973a",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 700,
              borderLeft: "1px solid #2d6b35",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(7, 1fr)` }}>
        {days.map((d) => {
          const list = byDay.get(d.iso) ?? [];
          const revenue = list.reduce((s, a) => s + a.totalCad, 0);
          const gp = list.reduce((s, a) => s + a.grossProfitCad, 0);
          const isCurrentMonth = d.inCurrentMonth;
          const isToday = d.iso === todayISO;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => onJumpToDay(d.iso)}
              style={{
                minHeight: "110px",
                padding: "8px",
                borderLeft: "1px solid #1f4a28",
                borderTop: "1px solid #1f4a28",
                backgroundColor: "transparent",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontFamily: "inherit",
                opacity: isCurrentMonth ? 1 : 0.4,
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? "#c4973a" : "#e8d5a3",
                }}
              >
                {d.dayOfMonth}
              </div>
              {list.length > 0 && (
                <>
                  <div style={{ fontSize: "11px", color: "#8dc63f", fontWeight: 600 }}>
                    {list.length} appt{list.length === 1 ? "" : "s"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#e8d5a3" }}>
                    Rev: {formatCurrency(revenue)}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: gp >= 0 ? "#8dc63f" : "#e05252",
                      fontWeight: 600,
                    }}
                  >
                    GP: {formatCurrency(gp)}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Utility ──────────────────────────────────────────────────── */

function NavArrow({
  direction,
  currentISO,
  view,
  onJump,
}: {
  direction: "prev" | "next";
  currentISO: string;
  view: "week" | "month";
  onJump: (iso: string) => void;
}) {
  const jump = () => {
    const [y, m, d] = currentISO.split("-").map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (view === "week") {
      dt.setUTCDate(dt.getUTCDate() + (direction === "next" ? 7 : -7));
    } else {
      dt.setUTCMonth(dt.getUTCMonth() + (direction === "next" ? 1 : -1));
    }
    const iso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    onJump(iso);
  };
  const Icon = direction === "next" ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={jump}
      style={{
        padding: "6px 8px",
        border: "1px solid #2d6b35",
        borderRadius: "8px",
        backgroundColor: "transparent",
        color: "#e8d5a3",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
      }}
      aria-label={direction === "next" ? "Next" : "Previous"}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function weekDaysFor(anchorISO: string) {
  const [y, m, d] = anchorISO.split("-").map((n) => parseInt(n, 10));
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const dow = (anchor.getUTCDay() + 6) % 7;
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() - dow);
  const days = [];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setUTCDate(monday.getUTCDate() + i);
    days.push({
      iso: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
      label: labels[i],
      dayOfMonth: dt.getUTCDate(),
    });
  }
  return days;
}

function monthDaysFor(anchorISO: string) {
  const [y, m] = anchorISO.split("-").map((n) => parseInt(n, 10));
  const first = new Date(Date.UTC(y, m - 1, 1));
  const dowFirst = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - dowFirst);
  const days: Array<{ iso: string; dayOfMonth: number; inCurrentMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(gridStart);
    dt.setUTCDate(gridStart.getUTCDate() + i);
    days.push({
      iso: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
      dayOfMonth: dt.getUTCDate(),
      inCurrentMonth: dt.getUTCMonth() === m - 1,
    });
  }
  return days;
}

function groupByDayHour(
  appts: CalendarAppointment[],
): Map<string, CalendarAppointment[]> {
  const map = new Map<string, CalendarAppointment[]>();
  for (const a of appts) {
    // Bucket by Calgary local day + hour.
    const local = calgaryParts(a.appointmentAt);
    const key = `${local.iso}-${local.hour}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return map;
}

function groupByDay(
  appts: CalendarAppointment[],
): Map<string, CalendarAppointment[]> {
  const map = new Map<string, CalendarAppointment[]>();
  for (const a of appts) {
    const local = calgaryParts(a.appointmentAt);
    if (!map.has(local.iso)) map.set(local.iso, []);
    map.get(local.iso)!.push(a);
  }
  return map;
}

function calgaryParts(iso: string): { iso: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  return { iso: `${y}-${m}-${d}`, hour: parseInt(h, 10) };
}

function todayCalgaryISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function formatHour(h: number): string {
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function formatWeekLabel(anchorISO: string): string {
  const days = weekDaysFor(anchorISO);
  const [y, m, d] = days[0].iso.split("-").map((n) => parseInt(n, 10));
  const firstDate = new Date(Date.UTC(y, m - 1, d));
  const monthName = firstDate.toLocaleString("en-CA", { month: "long", timeZone: "UTC" });
  return `${monthName} ${days[0].dayOfMonth} – ${days[6].dayOfMonth}, ${y}`;
}

function formatMonthLabel(anchorISO: string): string {
  const [y, m] = anchorISO.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

function shortCode(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
}
