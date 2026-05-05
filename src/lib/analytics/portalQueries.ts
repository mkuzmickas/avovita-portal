import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side counters for the portal-internal stages of the unified
 * funnel. Mirrors the admin-exclusion + range filtering the dashboard's
 * client-side aggregation uses (see AnalyticsDashboard.tsx fetchData) so
 * the funnel and the rest of the dashboard agree.
 */

const PORTAL_ROW_LIMIT = 50_000;

/** Statuses representing an order that has cleared payment (Stripe webhook
 *  flips orders to "confirmed" on payment success — see
 *  src/app/api/stripe/webhook/route.ts). "pending" = unpaid, "cancelled" =
 *  voided; everything else means the order completed checkout. */
export const COMPLETED_ORDER_STATUSES: ReadonlyArray<string> = [
  "confirmed",
  "scheduled",
  "collected",
  "shipped",
  "resulted",
  "complete",
];

export interface PortalQueryContext {
  supabase: SupabaseClient;
  /** Admin account ids — fetched once per request and reused across stages. */
  adminIds: ReadonlySet<string>;
}

export async function getAdminAccountIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("role", "admin");
  if (error) throw error;
  return new Set(((data ?? []) as { id: string }[]).map((a) => a.id));
}

/**
 * Distinct portal session count from page_views over [startDate, endDate],
 * excluding rows whose account_id belongs to an admin (matching the
 * AnalyticsDashboard convention).
 */
export async function getPortalSessions(
  ctx: PortalQueryContext,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const { data, error } = await ctx.supabase
    .from("page_views")
    .select("session_id, account_id")
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .limit(PORTAL_ROW_LIMIT);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    session_id: string | null;
    account_id: string | null;
  }>;

  const sessions = new Set<string>();
  for (const r of rows) {
    if (!r.session_id) continue;
    if (r.account_id && ctx.adminIds.has(r.account_id)) continue;
    sessions.add(r.session_id);
  }
  return sessions.size;
}

/**
 * Count of analytics_events rows of a given event_type in range, excluding
 * events authored by admin accounts.
 */
export async function getEventCount(
  ctx: PortalQueryContext,
  eventType: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  let query = ctx.supabase
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  if (ctx.adminIds.size > 0) {
    // PostgREST's not.in expects a parenthesised CSV string of UUIDs.
    const csv = `(${[...ctx.adminIds].join(",")})`;
    query = query.or(`account_id.is.null,account_id.not.in.${csv}`);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Count of orders that cleared payment (status in COMPLETED_ORDER_STATUSES)
 * within the date range. Admin-authored orders aren't excluded because
 * orders.account_id is the customer, not the dashboard viewer; the only
 * way an "admin order" exists is if an admin tested checkout flow against
 * their own account, which is rare and not worth filtering.
 */
export async function getCompletedOrderCount(
  ctx: PortalQueryContext,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const { count, error } = await ctx.supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", [...COMPLETED_ORDER_STATUSES])
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());
  if (error) throw error;
  return count ?? 0;
}
