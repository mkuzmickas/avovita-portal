import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchCalendarAppointments } from "@/lib/calendar/fetch-appointments";
import { CalendarClient } from "./CalendarClient";

export const dynamic = "force-dynamic";

interface SearchParams {
  /** ISO YYYY-MM-DD — the day whose week (Mon–Sun containing it) or
   *  month is currently displayed. Defaults to today. */
  date?: string;
  /** 'week' (default) or 'month'. */
  view?: string;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { date, view } = await searchParams;
  const anchorISO = date ?? todayCalgaryISO();
  const activeView: "week" | "month" = view === "month" ? "month" : "week";

  const { startISO, endISO } = rangeFor(anchorISO, activeView);
  const service = createServiceRoleClient();
  const appointments = await fetchCalendarAppointments(
    service,
    startISO,
    endISO,
  );

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>Calendar</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          FloLabs mobile-collection appointments matched from Acuity
          confirmations.
        </p>
      </div>
      <CalendarClient
        anchorISO={anchorISO}
        activeView={activeView}
        appointments={appointments}
      />
    </div>
  );
}

/** Today's date in Calgary local (YYYY-MM-DD). */
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

/**
 * Given an anchor date in Calgary local and a view mode, return the
 * ISO range covered by that view. Week = Mon–Sun containing the
 * anchor; month = 1st–last of the anchor's month.
 */
function rangeFor(
  anchorISO: string,
  view: "week" | "month",
): { startISO: string; endISO: string } {
  const [y, m, d] = anchorISO.split("-").map((n) => parseInt(n, 10));
  const anchor = new Date(Date.UTC(y, m - 1, d));
  if (view === "week") {
    // Week starts Monday. Sunday = 0 in JS; convert to 1-indexed Mon.
    const dow = (anchor.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    const start = new Date(anchor);
    start.setUTCDate(anchor.getUTCDate() - dow);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return { startISO: isoAtCalgaryMidnight(start), endISO: isoAtCalgaryMidnight(end) };
  }
  // Month
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { startISO: isoAtCalgaryMidnight(start), endISO: isoAtCalgaryMidnight(end) };
}

function isoAtCalgaryMidnight(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  // Calgary is MST=UTC-7, MDT=UTC-6. Compute per date via Intl for
  // correctness across DST transitions.
  const probeDate = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), 12));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "longOffset",
  }).formatToParts(probeDate);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-06:00";
  const offset = raw.startsWith("GMT") ? raw.slice(3) : "-06:00";
  return `${y}-${m}-${day}T00:00:00${offset}`;
}
