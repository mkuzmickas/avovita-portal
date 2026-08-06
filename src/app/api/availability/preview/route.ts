import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/availability/preview
 *
 * Returns a 14-day rolling summary of FloLabs collection availability so
 * the on-page "Check Availability" widget can render its own compact
 * calendar instead of embedding Acuity's booking iframe.
 *
 * How it works
 * ------------
 * The public FloLabs Acuity embed makes an unauthenticated XHR to its
 * own `availability/times` endpoint every time a customer navigates the
 * calendar. We call the same endpoint server-side, per-day, in
 * parallel, and aggregate the result into a shape the frontend can
 * render as coloured cells (slot count + first/last time). Because the
 * endpoint is what Acuity's own frontend uses for anonymous browsers,
 * no API credentials are involved — we're consuming what any customer
 * would see, just from our server, cached to keep the request volume
 * neighbourly.
 *
 * Caveat: this is Acuity's undocumented internal endpoint. If they
 * change the URL or response shape we lose the widget until we adapt.
 * The `AvailabilityUnavailable` state on the client handles that
 * gracefully with a link out to the full FloLabs booking page.
 */

const FLOLABS_BASE =
  "https://flolabsbooking.as.me/api/scheduling/v1/availability/times";
const OWNER = "b536fb59";
const APPOINTMENT_TYPE_ID = "84416067";
const CALENDAR_ID = "10968729";
const TIMEZONE = "America/Edmonton";
const LOOKAHEAD_DAYS = 14;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — enough to make a burst of
// widget opens cheap while keeping the numbers fresh at hour scale.

interface AcuitySlot {
  time: string; // ISO 8601 with tz offset
  slotsAvailable: number;
}
type AcuityDayResponse = Record<string, AcuitySlot[]>;

export interface DaySummary {
  /** YYYY-MM-DD in FloLabs' local (Edmonton) timezone. */
  date: string;
  /** "Mon", "Tue", … */
  weekday: string;
  /** Sum of slotsAvailable across every time on that day. 0 = fully
   *  booked / no offering (widget renders "Fully booked" either way). */
  slotCount: number;
  /** First and last slot times of the day, formatted for the widget
   *  ("7 AM", "10:30 AM", etc). Null when slotCount is 0. */
  firstTime: string | null;
  lastTime: string | null;
}

interface PreviewResponse {
  /** ISO timestamp the cache snapshot was taken (server-side). */
  fetchedAt: string;
  /** 14 sequential entries starting with today's date in FloLabs' tz. */
  days: DaySummary[];
  /** True when this response came from the in-memory cache; false when
   *  it was just refreshed. Purely informational for observability. */
  cached: boolean;
}

// In-memory cache. Vercel serverless spins up multiple instances; each
// gets its own cache. That's fine — the whole point is to be
// neighbourly, and per-instance caching is enough for that at the
// widget's traffic scale. Swap to Vercel KV / Redis if we need a
// single-source-of-truth cache later.
let cache: { expiresAt: number; payload: PreviewResponse } | null = null;

function ymdInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

function weekdayInTz(ymd: string, tz: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // UTC noon so the weekday matches the intended calendar day in every
  // tz we care about (rounding either side of midnight isn't an issue).
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    timeZone: tz,
  }).format(dt);
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
    hour12: true,
  })
    .format(d)
    .replace(":00", "") // "7:00 AM" → "7 AM"
    .replace(/ | /g, " "); // normalise narrow-no-break spaces
}

async function fetchDay(ymd: string): Promise<AcuitySlot[]> {
  const url = new URL(FLOLABS_BASE);
  url.searchParams.set("owner", OWNER);
  url.searchParams.set("appointmentTypeId", APPOINTMENT_TYPE_ID);
  url.searchParams.set("calendarId", CALENDAR_ID);
  url.searchParams.set("startDate", ymd);
  url.searchParams.set("timezone", TIMEZONE);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      // A polite UA — Acuity's own frontend calls this endpoint from a
      // browser context. Server-side fetch's default Node UA is more
      // likely to hit any bot filters they might add later.
      "User-Agent":
        "AvoVita-AvailabilityPreview/1.0 (+https://portal.avovita.ca)",
    },
    // We manage our own cache above; don't let Next's fetch layer add
    // another one on top and confuse the TTL math.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `FloLabs availability endpoint returned ${res.status} for ${ymd}`,
    );
  }
  const json = (await res.json()) as AcuityDayResponse;
  return json[ymd] ?? [];
}

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json({ ...cache.payload, cached: true });
  }

  const todayYmd = ymdInTz(new Date(now), TIMEZONE);
  const dates = Array.from({ length: LOOKAHEAD_DAYS }, (_, i) =>
    addDays(todayYmd, i),
  );

  // Fire all 14 in parallel. Each call is ~300 bytes — negligible cost
  // and negligible impact on FloLabs' backend. If any individual day
  // errors we still return the others; the frontend renders those
  // cells as "unavailable" without breaking the whole widget.
  const results = await Promise.allSettled(dates.map(fetchDay));

  const days: DaySummary[] = results.map((r, i) => {
    const ymd = dates[i];
    const weekday = weekdayInTz(ymd, TIMEZONE);
    if (r.status !== "fulfilled") {
      console.warn(
        `[availability-preview] day fetch failed for ${ymd}:`,
        (r.reason as Error)?.message,
      );
      return {
        date: ymd,
        weekday,
        slotCount: 0,
        firstTime: null,
        lastTime: null,
      };
    }
    const slots = r.value;
    const slotCount = slots.reduce(
      (s, x) => s + (x.slotsAvailable || 0),
      0,
    );
    const firstTime =
      slots.length > 0 ? formatSlotTime(slots[0].time) : null;
    const lastTime =
      slots.length > 0
        ? formatSlotTime(slots[slots.length - 1].time)
        : null;
    return { date: ymd, weekday, slotCount, firstTime, lastTime };
  });

  const allFailed = results.every((r) => r.status !== "fulfilled");
  if (allFailed) {
    // Don't cache a total failure — the FloLabs endpoint might be
    // briefly down; we want the next request to retry.
    return NextResponse.json(
      {
        error:
          "Availability preview is temporarily unavailable. You can still book after checkout — full availability is on the FloLabs page.",
      },
      { status: 503 },
    );
  }

  const payload: PreviewResponse = {
    fetchedAt: new Date(now).toISOString(),
    days,
    cached: false,
  };
  cache = { expiresAt: now + CACHE_TTL_MS, payload };
  return NextResponse.json(payload);
}
