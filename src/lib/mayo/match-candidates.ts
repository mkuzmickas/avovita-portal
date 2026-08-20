import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mayo invoice → portal order matcher.
 *
 * Mayo Patient IDs are NOT populated in the portal (we never wired
 * Pipeline 1 into steady-state), so matching is name + date only.
 *
 * Strategy per invoice line:
 *   1. Split invoice patient_name ("LAST, FIRST") → (last, first).
 *   2. Fetch patient_profiles where UPPER(last_name) matches AND
 *      UPPER(first_name) starts with the invoice first-name prefix
 *      (Mayo occasionally truncates or uses middle names).
 *   3. For each matched profile, fetch orders whose collection window
 *      overlaps [collection_date - 14 days, collection_date + 2 days].
 *      Mayo collection_date is when the specimen ARRIVED at Mayo, so
 *      the portal appointment_at usually precedes it by 1–3 days for
 *      shipping transit; we allow a wider back-window for slow ships.
 *   4. Rank: exact-name match + closest date = best.
 *
 * Returns candidates ordered best-first. Auto-match uses only the top
 * candidate if it's uniquely strong (single high-confidence hit).
 */

export interface OrderCandidate {
  order_id: string;
  patient_name: string;
  patient_first: string;
  patient_last: string;
  /** YYYY-MM-DD — Mayo invoices never carry DOB, so this is a UI
   *  disambiguator only. When two portal profiles share a name,
   *  Mike eye-checks the DOB before dragging. */
  patient_dob: string | null;
  appointment_at: string | null;
  shipping_date: string | null;
  score: number; // 0-100, higher is better
  reason: string; // short human-readable why-this-matched
}

interface ProfileRow {
  id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
}

interface OrderRow {
  id: string;
  account_id: string;
  appointment_at: string | null;
  appointment_date: string | null;
  shipping_date: string | null;
  shipped_at: string | null;
}

/**
 * Parse "LAST, FIRST" (with possible middle-name suffixes) into parts.
 * Handles the odd Mayo cases: "LUIZ RABELLO DE OLIVEIRA, ADRIEL" and
 * "HOFFSCHNEIDER GUEDES GAYER, ARIANNE" — the whole comma-delimited
 * left side is the last-name-block.
 */
export function splitMayoName(full: string): {
  last: string;
  first: string;
} {
  const parts = full.split(",").map((s) => s.trim());
  if (parts.length < 2) return { last: full.trim(), first: "" };
  return { last: parts[0].toUpperCase(), first: parts[1].toUpperCase() };
}

/**
 * Days between two YYYY-MM-DD dates (or ISO timestamps). Positive
 * when `a` is after `b`.
 */
function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((da - db) / (24 * 60 * 60 * 1000));
}

/**
 * Compute candidate orders for a single invoice line. Called both by
 * the auto-matcher at upload time and by the matcher UI when
 * rendering suggestions.
 */
export async function candidatesForLine(
  service: SupabaseClient,
  invoiceLine: {
    patient_name: string;
    collection_date: string; // YYYY-MM-DD
  },
): Promise<OrderCandidate[]> {
  const { last, first } = splitMayoName(invoiceLine.patient_name);
  if (!last) return [];

  // Fetch profiles whose last name matches (case-insensitive exact).
  const { data: profilesRaw } = await service
    .from("patient_profiles")
    .select("id, account_id, first_name, last_name, date_of_birth")
    .ilike("last_name", last);
  const profiles = (profilesRaw ?? []) as ProfileRow[];
  if (profiles.length === 0) return [];

  // Narrow by first name (starts-with, case-insensitive). If the
  // invoice first-name is empty we keep all last-name matches.
  const firstMatch = first
    ? profiles.filter((p) =>
        (p.first_name ?? "").toUpperCase().startsWith(first.split(" ")[0]),
      )
    : profiles;
  const candidates = firstMatch.length > 0 ? firstMatch : profiles;

  const accountIds = [...new Set(candidates.map((c) => c.account_id))];
  if (accountIds.length === 0) return [];

  // Fetch orders for those accounts within date window
  // [collection_date - 21 days, collection_date + 3 days] (wide-ish
  // to catch slow international shipments and late invoicing).
  const start = new Date(invoiceLine.collection_date);
  start.setDate(start.getDate() - 21);
  const end = new Date(invoiceLine.collection_date);
  end.setDate(end.getDate() + 3);

  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      "id, account_id, appointment_at, appointment_date, shipping_date, shipped_at",
    )
    .in("account_id", accountIds);
  const orders = (ordersRaw ?? []) as OrderRow[];

  const results: OrderCandidate[] = [];
  for (const o of orders) {
    // Anchor date: prefer appointment_at (real collection); fallback
    // to appointment_date; then shipping_date; then shipped_at.
    const anchor =
      o.appointment_at ||
      o.appointment_date ||
      o.shipping_date ||
      o.shipped_at;
    if (!anchor) continue;
    const anchorDate = new Date(anchor);
    if (anchorDate < start || anchorDate > end) continue;

    const profile = candidates.find((c) => c.account_id === o.account_id);
    if (!profile) continue;

    const diff = Math.abs(
      daysBetween(anchor, invoiceLine.collection_date),
    );
    const nameExact =
      profile.first_name.toUpperCase() === first &&
      profile.last_name.toUpperCase() === last;

    // Score: 100 - abs(days_off)*2, bonus for exact first-name match,
    // penalty per candidate profile beyond the first (name ambiguity).
    let score = 100 - diff * 3;
    if (nameExact) score += 10;
    if (candidates.length > 1) score -= 5;
    score = Math.max(0, Math.min(100, score));

    results.push({
      order_id: o.id,
      patient_name: `${profile.first_name} ${profile.last_name}`,
      patient_first: profile.first_name,
      patient_last: profile.last_name,
      patient_dob: profile.date_of_birth,
      appointment_at: o.appointment_at,
      shipping_date: o.shipping_date,
      score,
      reason: `${nameExact ? "exact-name" : "name+prefix"} · ${diff}d off`,
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Auto-match rule: single candidate with score ≥ 85 → auto-match.
 * Anything else → leave for manual drag-and-drop.
 */
export function pickAutoMatch(cands: OrderCandidate[]): string | null {
  if (cands.length === 0) return null;
  if (cands[0].score < 85) return null;
  if (cands.length > 1 && cands[1].score >= cands[0].score - 5) return null;
  return cands[0].order_id;
}
