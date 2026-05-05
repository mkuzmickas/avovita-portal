import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRange, type DateRange } from "@/lib/dates/range";
import {
  getSessionsAndUsersByDay,
  getAcquisitionChannels,
  getTopLandingPages,
  getDeviceBreakdown,
  getOutboundClicksToPortal,
} from "@/lib/analytics/ga4Queries";
import {
  cacheKey,
  getCached,
  setCached,
  mapGAError,
  type GAResponse,
} from "@/lib/analytics/gaCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/ga?range=7d&customStart=YYYY-MM-DD&customEnd=YYYY-MM-DD
 *
 * Admin-only. Returns marketing-site (avovita.ca) GA4 metrics for the
 * dashboard's selected date range. Server-side 15-minute cache keyed on
 * (range, start, end) keeps usage well below the 200K-tokens/day quota.
 */

const VALID_RANGES: ReadonlySet<DateRange> = new Set([
  "today",
  "7d",
  "30d",
  "90d",
  "custom",
]);

export async function GET(request: NextRequest) {
  // ── Admin auth ─────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: callerRow } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const callerRole = (callerRow as { role: string } | null)?.role ?? null;
  if (callerRole !== "admin") {
    return NextResponse.json(
      { error: "Forbidden — admin only" },
      { status: 403 },
    );
  }

  // ── Parse + validate date range ────────────────────────────────────
  const url = new URL(request.url);
  const rangeParam = (url.searchParams.get("range") ?? "30d") as DateRange;
  if (!VALID_RANGES.has(rangeParam)) {
    return NextResponse.json(
      { error: `Invalid range: ${rangeParam}` },
      { status: 400 },
    );
  }
  const customStart = url.searchParams.get("customStart") ?? undefined;
  const customEnd = url.searchParams.get("customEnd") ?? undefined;

  const { startDateYMD, endDateYMD } = resolveDateRange(
    rangeParam,
    customStart,
    customEnd,
  );

  // ── Cache lookup ───────────────────────────────────────────────────
  const key = cacheKey(rangeParam, startDateYMD, endDateYMD);
  const cached = getCached(key);
  if (cached) {
    return NextResponse.json(cached);
  }

  // ── Fan out the GA queries in parallel ─────────────────────────────
  try {
    const [
      sessionsByDay,
      acquisitionChannels,
      topLandingPages,
      deviceBreakdown,
      outboundClicksToPortal,
    ] = await Promise.all([
      getSessionsAndUsersByDay(startDateYMD, endDateYMD),
      getAcquisitionChannels(startDateYMD, endDateYMD),
      getTopLandingPages(startDateYMD, endDateYMD, 10),
      getDeviceBreakdown(startDateYMD, endDateYMD),
      getOutboundClicksToPortal(startDateYMD, endDateYMD),
    ]);

    const value: GAResponse = {
      range: { startDate: startDateYMD, endDate: endDateYMD },
      sessionsByDay,
      acquisitionChannels,
      topLandingPages,
      deviceBreakdown,
      outboundClicksToPortal,
    };

    setCached(key, value);
    return NextResponse.json(value);
  } catch (err) {
    console.error("[ga4] runReport failed:", err);
    const { status, body } = mapGAError(err);
    return NextResponse.json(body, { status });
  }
}
