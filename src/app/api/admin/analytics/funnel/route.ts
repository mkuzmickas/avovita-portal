import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resolveDateRange, type DateRange } from "@/lib/dates/range";
import {
  getSessionsAndUsersByDay,
  getOutboundClicksToPortal,
} from "@/lib/analytics/ga4Queries";
import {
  getAdminAccountIds,
  getPortalSessions,
  getEventCount,
  getCompletedOrderCount,
} from "@/lib/analytics/portalQueries";
import { mapGAError } from "@/lib/analytics/gaCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/funnel?range=7d&channel=All
 *
 * Admin-only. Returns the seven stages of the unified funnel, marking
 * GA-derived stages and portal-derived stages independently so the UI can
 * partial-render if one source fails.
 *
 * Channel filter — when supplied (and != "All") — refilters the GA
 * stages by sessionDefaultChannelGroup. Portal stages have no
 * cross-domain attribution, so they ignore the channel filter and the
 * UI greys them out.
 *
 * 15-min in-memory cache, keyed on (range, start, end, channel).
 */

const VALID_RANGES: ReadonlySet<DateRange> = new Set([
  "today",
  "7d",
  "30d",
  "90d",
  "custom",
]);

const VALID_CHANNELS: ReadonlySet<string> = new Set([
  "All",
  "Organic Search",
  "Direct",
  "Referral",
  "Social",
  "Email",
  "Paid Search",
  "Paid Social",
  "Display",
]);

interface FunnelGAStages {
  marketingSessions: number;
  outboundClicksToPortal: number | null;
}
interface FunnelPortalStages {
  portalSessions: number;
  testViewed: number;
  testAddedToCart: number;
  checkoutStarted: number;
  orderCompleted: number;
}
export interface FunnelResponse {
  range: { startDate: string; endDate: string };
  channel: string;
  ga: FunnelGAStages | null;
  gaError: { code: "auth" | "quota" | "unavailable"; message: string } | null;
  portal: FunnelPortalStages | null;
  portalError: { message: string } | null;
}

const CACHE_TTL_MS = 15 * 60 * 1_000;
const cache = new Map<string, { value: FunnelResponse; expiresAt: number }>();

function cacheKey(
  range: string,
  start: string,
  end: string,
  channel: string,
): string {
  return `${range}|${start}|${end}|${channel}`;
}

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

  // ── Parse + validate query params ──────────────────────────────────
  const url = new URL(request.url);
  const rangeParam = (url.searchParams.get("range") ?? "30d") as DateRange;
  if (!VALID_RANGES.has(rangeParam)) {
    return NextResponse.json(
      { error: `Invalid range: ${rangeParam}` },
      { status: 400 },
    );
  }
  const channelParam = url.searchParams.get("channel") ?? "All";
  if (!VALID_CHANNELS.has(channelParam)) {
    return NextResponse.json(
      { error: `Invalid channel: ${channelParam}` },
      { status: 400 },
    );
  }
  const customStart = url.searchParams.get("customStart") ?? undefined;
  const customEnd = url.searchParams.get("customEnd") ?? undefined;

  const { startDate, endDate, startDateYMD, endDateYMD } = resolveDateRange(
    rangeParam,
    customStart,
    customEnd,
  );

  // ── Cache lookup ───────────────────────────────────────────────────
  const key = cacheKey(rangeParam, startDateYMD, endDateYMD, channelParam);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json(hit.value);
  }

  const channelArg = channelParam === "All" ? undefined : channelParam;

  // ── Independent GA + portal fetches; one failing must not kill the
  //    other. Fan-out lets the page render partial results. ─────────
  const gaPromise = (async (): Promise<{
    ga: FunnelGAStages | null;
    gaError: FunnelResponse["gaError"];
  }> => {
    try {
      const [byDay, outbound] = await Promise.all([
        getSessionsAndUsersByDay(
          startDateYMD,
          endDateYMD,
          undefined,
          channelArg,
        ),
        getOutboundClicksToPortal(
          startDateYMD,
          endDateYMD,
          undefined,
          channelArg,
        ),
      ]);
      const marketingSessions = byDay.reduce((s, d) => s + d.sessions, 0);
      return {
        ga: { marketingSessions, outboundClicksToPortal: outbound },
        gaError: null,
      };
    } catch (err) {
      console.error("[funnel] GA fetch failed:", err);
      const { body } = mapGAError(err);
      return {
        ga: null,
        gaError: { code: body.code, message: body.error },
      };
    }
  })();

  const portalPromise = (async (): Promise<{
    portal: FunnelPortalStages | null;
    portalError: FunnelResponse["portalError"];
  }> => {
    try {
      const service = createServiceRoleClient();
      const adminIds = await getAdminAccountIds(service);
      const ctx = { supabase: service, adminIds };

      const [
        portalSessions,
        testViewed,
        testAddedToCart,
        checkoutStarted,
        orderCompleted,
      ] = await Promise.all([
        getPortalSessions(ctx, startDate, endDate),
        getEventCount(ctx, "test_viewed", startDate, endDate),
        getEventCount(ctx, "test_added_to_cart", startDate, endDate),
        getEventCount(ctx, "checkout_started", startDate, endDate),
        getCompletedOrderCount(ctx, startDate, endDate),
      ]);

      return {
        portal: {
          portalSessions,
          testViewed,
          testAddedToCart,
          checkoutStarted,
          orderCompleted,
        },
        portalError: null,
      };
    } catch (err) {
      console.error("[funnel] portal fetch failed:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Portal data temporarily unavailable";
      return { portal: null, portalError: { message } };
    }
  })();

  const [gaPart, portalPart] = await Promise.all([gaPromise, portalPromise]);

  const value: FunnelResponse = {
    range: { startDate: startDateYMD, endDate: endDateYMD },
    channel: channelParam,
    ga: gaPart.ga,
    gaError: gaPart.gaError,
    portal: portalPart.portal,
    portalError: portalPart.portalError,
  };

  // Only cache when at least one half of the funnel succeeded — caching
  // an all-error response would lock the dashboard into a 15-min outage
  // even after the upstream recovered.
  if (value.ga || value.portal) {
    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  }

  return NextResponse.json(value);
}
