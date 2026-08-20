import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QBO_API_HOST, refreshAccessToken } from "./oauth";

/**
 * Thin wrapper around the QBO REST API.
 *
 * Handles:
 *   - reading the stored integration row from Supabase
 *   - refreshing the access token when within 5 min of expiry
 *   - executing SQL-like queries via /v3/company/{realmId}/query
 *   - paginating results (QBO caps at 1000 rows per page)
 */

const REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before expiry

interface IntegrationRow {
  id: string;
  provider: string;
  realm_id: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string | null;
}

async function loadIntegration(
  service: SupabaseClient,
): Promise<IntegrationRow> {
  const { data, error } = await service
    .from("integrations")
    .select(
      "id, provider, realm_id, access_token, refresh_token, expires_at, refresh_expires_at",
    )
    .eq("provider", "quickbooks")
    .maybeSingle();
  if (error) throw new Error(`Failed to load QBO integration: ${error.message}`);
  if (!data) {
    throw new Error("QuickBooks is not connected — visit /admin/financials and click 'Connect QuickBooks'.");
  }
  return data as unknown as IntegrationRow;
}

/**
 * Return a valid access token, refreshing (and persisting the new
 * tokens) if the current one is expired or within 5 min of expiry.
 * Intuit rotates refresh tokens periodically — we always write back
 * whatever the /tokens/bearer response returns.
 */
export async function getValidAccessToken(
  service: SupabaseClient,
): Promise<{ accessToken: string; realmId: string }> {
  const integ = await loadIntegration(service);
  if (!integ.realm_id) {
    throw new Error("QBO integration is missing realm_id — reconnect required.");
  }
  const expiresAt = new Date(integ.expires_at).getTime();
  const needsRefresh = Date.now() > expiresAt - REFRESH_SKEW_MS;
  if (!needsRefresh) {
    return { accessToken: integ.access_token, realmId: integ.realm_id };
  }
  const refreshed = await refreshAccessToken(integ.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const newRefreshExpires = new Date(
    Date.now() + refreshed.x_refresh_token_expires_in * 1000,
  ).toISOString();
  const { error } = await service
    .from("integrations")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: newExpires,
      refresh_expires_at: newRefreshExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integ.id);
  if (error) {
    // Not fatal for the current request — the refreshed token is
    // still valid; but log so we notice if writes start failing.
    console.error("[qbo] failed to persist refreshed tokens:", error.message);
  }
  return { accessToken: refreshed.access_token, realmId: integ.realm_id };
}

/**
 * Execute a QBO query. Uses the /query endpoint; the `q` string is
 * a subset-of-SQL specific to QBO ("select * from Purchase where
 * TxnDate >= '2026-05-01' order by TxnDate startposition 1 maxresults 1000").
 *
 * Returns the parsed `QueryResponse` object (whose keys vary by
 * entity — a Purchase query returns `Purchase: [...]`, a Bill query
 * returns `Bill: [...]`, etc.).
 */
export async function qboQuery<T = unknown>(
  service: SupabaseClient,
  q: string,
): Promise<{ QueryResponse: Record<string, T[]> & { totalCount?: number; startPosition?: number; maxResults?: number } }> {
  const { accessToken, realmId } = await getValidAccessToken(service);
  const url = `${QBO_API_HOST}/v3/company/${encodeURIComponent(realmId)}/query?minorversion=75&query=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`QBO query failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

/**
 * Paginated query — walks QBO's `startposition`/`maxresults` until
 * a page returns fewer than `pageSize` rows. Pass the entity NAME
 * (Purchase | Bill | Expense | CreditCardCharge | VendorCredit) so
 * we know which key to read from QueryResponse.
 *
 * `whereClause` is appended verbatim after `where`; do not prefix it.
 * Do not include `order by`, `startposition`, or `maxresults` — this
 * helper adds them.
 */
export async function qboQueryAll<T = unknown>(
  service: SupabaseClient,
  entity: string,
  whereClause: string,
  pageSize = 500,
): Promise<T[]> {
  const all: T[] = [];
  let start = 1;
  // Hard cap at 20 pages (10k rows) to guard against runaway loops.
  for (let page = 0; page < 20; page++) {
    const q = `select * from ${entity} where ${whereClause} order by TxnDate startposition ${start} maxresults ${pageSize}`;
    const resp = await qboQuery<T>(service, q);
    const rows = (resp.QueryResponse[entity] ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    start += pageSize;
  }
  return all;
}
