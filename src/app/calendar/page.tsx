import { redirect } from "next/navigation";
import { createServiceRoleClient, createClient } from "@/lib/supabase/server";
import { fetchCalendarAppointments } from "@/lib/calendar/fetch-appointments";
import { CalendarClient } from "@/app/(admin)/admin/calendar/CalendarClient";

export const dynamic = "force-dynamic";

/**
 * /calendar — public token-gated read-only view of the FloLabs
 * collection calendar. Two ways to reach it:
 *   1. FloLabs bookmarked URL: /calendar?token=<CALENDAR_ACCESS_TOKEN>
 *   2. Admin sidebar link:      /admin/calendar (session-authenticated)
 *
 * Same pattern as /shipping: this route lives outside the (admin)
 * route group so FloLabs never sees admin chrome, cannot log 'FloLabs
 * booking' entries, and cannot click appointment chips through to
 * order records. If the token leaks, rotate CALENDAR_ACCESS_TOKEN in
 * Vercel env vars and hand FloLabs a fresh URL.
 */

interface SearchParams {
  token?: string;
  /** ISO YYYY-MM-DD — the day whose week or month is displayed. */
  date?: string;
  /** 'week' (default) or 'month'. */
  view?: string;
}

async function isAdminSession(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: { role: string } | null };
  return (
    account?.role === "admin" || account?.role === "calendar_viewer"
  );
}

export default async function PublicCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token, date, view } = await searchParams;
  const expected = process.env.CALENDAR_ACCESS_TOKEN;
  const isAdmin = await isAdminSession();

  const tokenValid = !!expected && token === expected;
  if (!tokenValid && !isAdmin) {
    redirect("/");
  }

  const anchorISO = date ?? todayCalgaryISO();
  const activeView: "week" | "month" = view === "month" ? "month" : "week";
  const { startISO, endISO } = rangeFor(anchorISO, activeView);

  const service = createServiceRoleClient();
  const appointments = await fetchCalendarAppointments(
    service,
    startISO,
    endISO,
  );

  const extraQuery = tokenValid ? `token=${encodeURIComponent(token!)}` : "";

  return (
    <div
      style={{ minHeight: "100vh", backgroundColor: "#0a1a0d" }}
      className="p-6"
    >
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-6">
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>FloLabs Collection Calendar</span>
          </h1>
          <p className="mt-1" style={{ color: "#e8d5a3" }}>
            Read-only view of upcoming appointments — updated automatically as
            Acuity confirmations arrive.
          </p>
        </div>
        <CalendarClient
          anchorISO={anchorISO}
          activeView={activeView}
          appointments={appointments}
          basePath="/calendar"
          extraQuery={extraQuery}
          readOnly
        />
      </div>
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
    const dow = (anchor.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    const start = new Date(anchor);
    start.setUTCDate(anchor.getUTCDate() - dow);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return {
      startISO: isoAtCalgaryMidnight(start),
      endISO: isoAtCalgaryMidnight(end),
    };
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    startISO: isoAtCalgaryMidnight(start),
    endISO: isoAtCalgaryMidnight(end),
  };
}

function isoAtCalgaryMidnight(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const probeDate = new Date(
    Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), 12),
  );
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "longOffset",
  }).formatToParts(probeDate);
  const raw =
    parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-06:00";
  const offset = raw.startsWith("GMT") ? raw.slice(3) : "-06:00";
  return `${y}-${m}-${day}T00:00:00${offset}`;
}
