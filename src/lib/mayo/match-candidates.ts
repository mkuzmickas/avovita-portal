import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mayo invoice → portal order matcher.
 *
 * Mayo Patient IDs are NOT populated in the portal, so we match on
 * three signals:
 *
 *   1. Name (last-name exact + first-name prefix, case-insensitive)
 *   2. Collection-date proximity (Mayo's collection_date vs portal
 *      order's appointment_at / appointment_date / shipping_date)
 *   3. Test-SKU overlap (how many of the Mayo tests billed on this
 *      accession appear as tests in the portal order). This is the
 *      strongest signal — if Mike ordered Mayo tests A, B, C on
 *      this order, the invoice line for test A almost certainly
 *      belongs to it.
 *
 * The test-overlap signal turned a ~50% auto-match rate into
 * near-100% for the common case (single patient, distinct test
 * baskets across visits).
 */

export interface OrderCandidate {
  order_id: string;
  patient_name: string;
  patient_first: string;
  patient_last: string;
  patient_dob: string | null;
  appointment_at: string | null;
  shipping_date: string | null;
  /** Fallback anchor when no explicit date is set — Stripe charge time
   *  from orders.created_at. Displayed as "charge date" in the UI. */
  created_at: string | null;
  /** Number of Mayo tests on this accession that also appear on the
   *  candidate order (via fuzzy name match). */
  test_overlap: number;
  /** Every portal test name on this candidate order — shown in the UI
   *  so the reviewer can eyeball which order actually contains the
   *  tests being invoiced (crucial when multiple orders tie on score). */
  test_names: string[];
  score: number;
  reason: string;
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
  created_at: string;
}

interface OrderLineJoinRow {
  order_id: string;
  test: { name: string | null } | null;
}

// ─── Text normalization for fuzzy test-name matching ──────────────────

const STOPWORDS = new Set([
  "the", "and", "with", "for", "of", "a", "an", "on", "in", "by",
  // Common lab suffixes that are not distinguishing
  "s", "b", "p", "u", "serum", "plasma", "blood", "whole",
  "quantitative", "qualitative", "screen", "profile", "panel",
  "total", "free", "assay", "measurement",
]);

/**
 * Split a test description into distinctive tokens for overlap
 * scoring. Strategy:
 *   - lowercase, strip most punctuation, split on non-alphanumerics
 *   - drop tokens ≤2 chars (unless the token starts with a digit,
 *     in case it's a differentiator like "b12" or "d3")
 *   - drop obvious stopwords / lab-suffix noise
 */
function testTokens(desc: string | null | undefined): Set<string> {
  if (!desc) return new Set();
  const toks = desc
    .toLowerCase()
    .replace(/[(),./]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => t.length > 2 || /^[0-9]/.test(t))
    .filter((t) => !STOPWORDS.has(t));
  return new Set(toks);
}

/**
 * Jaccard-ish overlap between two token sets. Returns the number of
 * shared tokens (not a ratio) because the caller wants to score
 * "how many Mayo tests match" rather than a similarity coefficient.
 */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits;
}

/**
 * Consider two test names a "match" when they share at least 2
 * distinctive tokens OR one contains the other's normalized form.
 */
function looksLikeSameTest(
  mayoDesc: string | null,
  portalName: string | null,
): boolean {
  if (!mayoDesc || !portalName) return false;
  const a = testTokens(mayoDesc);
  const b = testTokens(portalName);
  if (a.size === 0 || b.size === 0) return false;
  if (tokenOverlap(a, b) >= 2) return true;
  // Fallback: substring containment on the normalized joined form
  const na = [...a].sort().join(" ");
  const nb = [...b].sort().join(" ");
  if (na.length >= 5 && nb.includes(na)) return true;
  if (nb.length >= 5 && na.includes(nb)) return true;
  return false;
}

// ─── Name splitting ───────────────────────────────────────────────────

export function splitMayoName(full: string): {
  last: string;
  first: string;
} {
  const parts = full.split(",").map((s) => s.trim());
  if (parts.length < 2) return { last: full.trim(), first: "" };
  return { last: parts[0].toUpperCase(), first: parts[1].toUpperCase() };
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((da - db) / (24 * 60 * 60 * 1000));
}

/**
 * Compute candidate orders for an invoice line (or a group of lines
 * from one accession). Pass ALL Mayo test descriptions on the
 * accession as `mayoTestDescriptions` for the highest-quality
 * overlap signal.
 */
export async function candidatesForLine(
  service: SupabaseClient,
  invoiceLine: {
    patient_name: string;
    collection_date: string;
    /** All Mayo test descriptions billed on this line's accession —
     *  used for the test-SKU overlap bonus. */
    mayoTestDescriptions?: string[];
  },
): Promise<OrderCandidate[]> {
  const { last, first } = splitMayoName(invoiceLine.patient_name);
  if (!last) return [];

  const { data: profilesRaw } = await service
    .from("patient_profiles")
    .select("id, account_id, first_name, last_name, date_of_birth")
    .ilike("last_name", last);
  let profiles = (profilesRaw ?? []) as ProfileRow[];
  // Fallback: substring last-name match for edge cases like hyphens
  // ("SMITH-JONES"), diacritics ("Filipović"), or trailing whitespace.
  // Guarded on last.length ≥ 4 so we don't accidentally match every
  // surname containing "LI" or "AN".
  if (profiles.length === 0 && last.length >= 4) {
    const { data: fallbackRaw } = await service
      .from("patient_profiles")
      .select("id, account_id, first_name, last_name, date_of_birth")
      .ilike("last_name", `%${last}%`);
    profiles = (fallbackRaw ?? []) as ProfileRow[];
  }
  if (profiles.length === 0) return [];

  const firstMatch = first
    ? profiles.filter((p) =>
        (p.first_name ?? "").toUpperCase().startsWith(first.split(" ")[0]),
      )
    : profiles;
  const candidates = firstMatch.length > 0 ? firstMatch : profiles;

  const accountIds = [...new Set(candidates.map((c) => c.account_id))];
  if (accountIds.length === 0) return [];

  // Widened date window: -35d back (Mayo can invoice weeks late) to
  // +5d forward (specimen may sit in transit before Mayo logs it).
  const start = new Date(invoiceLine.collection_date);
  start.setDate(start.getDate() - 35);
  const end = new Date(invoiceLine.collection_date);
  end.setDate(end.getDate() + 5);

  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      "id, account_id, appointment_at, appointment_date, shipping_date, shipped_at, created_at",
    )
    .in("account_id", accountIds);
  const orders = (ordersRaw ?? []) as OrderRow[];

  // Filter to date-window orders first, then fetch their test names
  // in one query for overlap scoring. `created_at` is the ultimate
  // fallback anchor — some orders (esp. those where the appointment
  // was never entered) have all four appointment/shipping dates null,
  // and dropping them silently is exactly the bug that made Ana
  // Filipovic's July 22 accession look "unmatched" while her Jul 20
  // charged order was sitting there in the DB.
  const eligibleOrders: OrderRow[] = [];
  for (const o of orders) {
    const anchor =
      o.appointment_at ||
      o.appointment_date ||
      o.shipping_date ||
      o.shipped_at ||
      o.created_at;
    if (!anchor) continue;
    const anchorDate = new Date(anchor);
    if (anchorDate < start || anchorDate > end) continue;
    eligibleOrders.push(o);
  }
  if (eligibleOrders.length === 0) return [];

  const eligibleOrderIds = eligibleOrders.map((o) => o.id);
  const { data: linesRaw } = await service
    .from("order_lines")
    .select("order_id, test:tests ( name )")
    .in("order_id", eligibleOrderIds)
    .eq("line_type", "test");
  const orderLines = (linesRaw ?? []) as unknown as OrderLineJoinRow[];
  const orderTestNames = new Map<string, string[]>();
  for (const ol of orderLines) {
    const name = ol.test?.name ?? null;
    if (!name) continue;
    const arr = orderTestNames.get(ol.order_id) ?? [];
    arr.push(name);
    orderTestNames.set(ol.order_id, arr);
  }

  const mayoDescs = invoiceLine.mayoTestDescriptions ?? [];

  const results: OrderCandidate[] = [];
  for (const o of eligibleOrders) {
    const profile = candidates.find((c) => c.account_id === o.account_id);
    if (!profile) continue;
    const anchor =
      o.appointment_at ||
      o.appointment_date ||
      o.shipping_date ||
      o.shipped_at ||
      o.created_at;
    const diff = Math.abs(daysBetween(anchor, invoiceLine.collection_date));

    // Test-SKU overlap — for each Mayo test on this accession, does
    // the candidate order have a test with a matching name?
    const orderNames = orderTestNames.get(o.id) ?? [];
    let overlap = 0;
    for (const md of mayoDescs) {
      for (const on of orderNames) {
        if (looksLikeSameTest(md, on)) {
          overlap++;
          break; // count each Mayo test at most once
        }
      }
    }

    const nameExact =
      profile.first_name.toUpperCase() === first &&
      profile.last_name.toUpperCase() === last;

    // Scoring:
    //   base 100
    //   - 1.5 × days off (max ~-52 at 35 days out — reachable but weak)
    //   + 5 exact-name bonus
    //   + 12 × test overlap (a single confirmed test is a stronger
    //         signal than 8 days of date proximity; three overlaps
    //         crushes date noise entirely)
    let score = 100 - diff * 1.5;
    if (nameExact) score += 5;
    score += overlap * 12;
    if (candidates.length > 1) score -= 3;
    score = Math.max(0, Math.min(200, score));

    const reasonParts: string[] = [];
    reasonParts.push(nameExact ? "exact-name" : "name+prefix");
    reasonParts.push(`${diff}d off`);
    if (overlap > 0) {
      reasonParts.push(
        `${overlap}/${mayoDescs.length} test${overlap === 1 ? "" : "s"} match`,
      );
    }

    results.push({
      order_id: o.id,
      patient_name: `${profile.first_name} ${profile.last_name}`,
      patient_first: profile.first_name,
      patient_last: profile.last_name,
      patient_dob: profile.date_of_birth,
      appointment_at: o.appointment_at,
      shipping_date: o.shipping_date,
      created_at: o.created_at,
      test_overlap: overlap,
      test_names: orderTestNames.get(o.id) ?? [],
      score: Math.round(score),
      reason: reasonParts.join(" · "),
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Auto-match rule. Order of preference:
 *   1. Only one candidate in the window → match it (as long as it
 *      isn't a hopeless 0-score outlier).
 *   2. Best candidate has ≥1 test-overlap AND leads runner-up by 5+
 *      → match. Test overlap is a strong-enough signal that even a
 *      thin margin over #2 is safe.
 *   3. Best candidate leads runner-up by 15+ (pure name+date proximity)
 *      → match.
 * Anything else stays unmatched for Mike to drag-drop.
 */
export function pickAutoMatch(cands: OrderCandidate[]): string | null {
  if (cands.length === 0) return null;
  const best = cands[0];
  if (best.score < 40) return null;
  if (cands.length === 1) return best.order_id;
  const second = cands[1];
  const margin = best.score - second.score;
  if (best.test_overlap >= 1 && margin >= 5) return best.order_id;
  if (margin >= 15) return best.order_id;
  return null;
}
