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
  /** Order total in CAD — extra disambiguator when everything else ties. */
  order_total_cad: number | null;
  /** Number of Mayo tests on this accession that also appear on the
   *  candidate order (via fuzzy name match). */
  test_overlap: number;
  /** Every portal test name on this candidate order — shown in the UI
   *  so the reviewer can eyeball which order actually contains the
   *  tests being invoiced (crucial when multiple orders tie on score). */
  test_names: string[];
  /** Subset of test_names that matched at least one Mayo description on
   *  this accession. UI highlights these chips green so the reviewer
   *  sees "yes, this one has the Cardio Risk panel" at a glance. */
  matched_test_names: string[];
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
  total_cad: number | null;
}

interface OrderLineJoinRow {
  order_id: string;
  test: {
    name: string | null;
    mayo_test_id: string | null;
    mayo_test_ids: string[] | null;
  } | null;
}

/**
 * Effective Mayo test IDs for a portal test: prefer the array
 * column (panels populate it), fall back to the singular column
 * (single-code tests keep it for the Mayo catalogue link).
 */
function effectiveMayoIds(t: {
  mayo_test_id: string | null;
  mayo_test_ids: string[] | null;
}): string[] {
  if (t.mayo_test_ids && t.mayo_test_ids.length > 0) return t.mayo_test_ids;
  if (t.mayo_test_id) return [t.mayo_test_id];
  return [];
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
     *  used for the fuzzy-name test-overlap bonus. */
    mayoTestDescriptions?: string[];
    /** All Mayo test IDs (e.g. ANST, CORT, T4FT4) billed on this line's
     *  accession. Used for exact SKU-to-SKU matching against portal
     *  tests' mayo_test_ids[] — stronger signal than fuzzy name match. */
    mayoTestIds?: string[];
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

  // Wide window: ±60 days from Mayo's collection date. Wider than
  // strictly necessary — but the day-off penalty in scoring handles
  // relevance and this lets us catch late-shipped or backdated
  // orders. Anchor per order is the CLOSEST of its 5 date fields to
  // Mayo's collection_date, not the first-non-null (see below).
  const collectionMs = new Date(invoiceLine.collection_date).getTime();
  const windowMs = 60 * 24 * 60 * 60 * 1000;

  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      "id, account_id, appointment_at, appointment_date, shipping_date, shipped_at, created_at, total_cad",
    )
    .in("account_id", accountIds);
  const orders = (ordersRaw ?? []) as OrderRow[];

  // Pick the anchor date as the CLOSEST of the 5 candidate dates on
  // the order — appointment_at/date, shipping_date, shipped_at, or
  // created_at. The old fallback chain broke on Sidonie
  // Durnford-Pascal: her order had shipping_date May 5 (6d after
  // Mayo's Apr 29 collection) and created_at Apr 22 (7d before), so
  // "first non-null wins" grabbed shipping_date, which sat 1 day
  // past the tight forward window and got her filtered out. Closest-
  // date + wider window fixes that class of bug.
  const eligibleOrders: Array<OrderRow & { anchorMs: number }> = [];
  for (const o of orders) {
    const dates = [
      o.appointment_at,
      o.appointment_date,
      o.shipping_date,
      o.shipped_at,
      o.created_at,
    ]
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d).getTime())
      .filter((n) => Number.isFinite(n));
    if (dates.length === 0) continue;
    // Closest to collectionMs
    let closest = dates[0];
    let closestDiff = Math.abs(closest - collectionMs);
    for (const d of dates) {
      const diff = Math.abs(d - collectionMs);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = d;
      }
    }
    if (closestDiff > windowMs) continue;
    eligibleOrders.push({ ...o, anchorMs: closest });
  }
  if (eligibleOrders.length === 0) return [];

  const eligibleOrderIds = eligibleOrders.map((o) => o.id);
  const { data: linesRaw } = await service
    .from("order_lines")
    .select("order_id, test:tests ( name, mayo_test_id, mayo_test_ids )")
    .in("order_id", eligibleOrderIds)
    .eq("line_type", "test");
  const orderLines = (linesRaw ?? []) as unknown as OrderLineJoinRow[];
  const orderTestNames = new Map<string, string[]>();
  const orderMayoIds = new Map<string, Set<string>>();
  for (const ol of orderLines) {
    const name = ol.test?.name ?? null;
    if (name) {
      const arr = orderTestNames.get(ol.order_id) ?? [];
      arr.push(name);
      orderTestNames.set(ol.order_id, arr);
    }
    if (ol.test) {
      const ids = effectiveMayoIds(ol.test);
      if (ids.length > 0) {
        const set = orderMayoIds.get(ol.order_id) ?? new Set<string>();
        for (const id of ids) set.add(id);
        orderMayoIds.set(ol.order_id, set);
      }
    }
  }

  const mayoDescs = invoiceLine.mayoTestDescriptions ?? [];
  const mayoTestIds = invoiceLine.mayoTestIds ?? [];

  const results: OrderCandidate[] = [];
  for (const o of eligibleOrders) {
    const profile = candidates.find((c) => c.account_id === o.account_id);
    if (!profile) continue;
    // anchorMs is the closest date to Mayo's collection_date across
    // all 5 of the order's date fields — pre-computed above.
    const diff = Math.round(
      Math.abs(o.anchorMs - collectionMs) / (24 * 60 * 60 * 1000),
    );

    // Test-SKU overlap — two paths:
    //   (a) EXACT SKU MATCH via tests.mayo_test_ids[]. If an invoice
    //       line's test_id (e.g. ANST) is in the effective
    //       mayo_test_ids of any portal test on the candidate order,
    //       that's deterministic — panels like MENS_HORMONE_PANEL now
    //       score properly instead of falling back to fuzzy name.
    //   (b) FUZZY NAME MATCH as a safety net for tests without a
    //       populated mayo_test_ids mapping.
    // We count each Mayo test at most once and prefer the SKU hit.
    const orderNames = orderTestNames.get(o.id) ?? [];
    const orderIds = orderMayoIds.get(o.id) ?? new Set<string>();
    let overlap = 0;
    let skuOverlap = 0;
    const matched = new Set<string>();
    const mayoTestSet = new Set(mayoTestIds);
    // SKU path — one hit per Mayo test id present on the order.
    for (const oid of orderIds) {
      if (mayoTestSet.has(oid)) {
        skuOverlap++;
        overlap++;
      }
    }
    // Name path for whatever the SKU path didn't already claim.
    // (We don't have a clean per-Mayo-test dedup key between SKU and
    // name matches, so this may modestly double-count when the same
    // Mayo test hits both — acceptable, biases toward stronger matches.)
    for (const md of mayoDescs) {
      for (const on of orderNames) {
        if (looksLikeSameTest(md, on)) {
          overlap++;
          matched.add(on);
          break;
        }
      }
    }

    const nameExact =
      profile.first_name.toUpperCase() === first &&
      profile.last_name.toUpperCase() === last;

    // Scoring:
    //   base 100
    //   - 1.5 × days off
    //   + 5 exact-name bonus
    //   + 15 × sku-overlap (deterministic Mayo-code hit)
    //   + 12 × fuzzy-name-overlap (safety net)
    let score = 100 - diff * 1.5;
    if (nameExact) score += 5;
    score += skuOverlap * 15;
    score += (overlap - skuOverlap) * 12; // name-only hits
    if (candidates.length > 1) score -= 3;
    score = Math.max(0, Math.min(300, score));

    const reasonParts: string[] = [];
    reasonParts.push(nameExact ? "exact-name" : "name+prefix");
    reasonParts.push(`${diff}d off`);
    if (skuOverlap > 0) {
      reasonParts.push(
        `${skuOverlap} SKU hit${skuOverlap === 1 ? "" : "s"}`,
      );
    }
    if (overlap - skuOverlap > 0) {
      reasonParts.push(
        `${overlap - skuOverlap} name match${overlap - skuOverlap === 1 ? "" : "es"}`,
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
      order_total_cad: o.total_cad,
      test_overlap: overlap,
      test_names: orderTestNames.get(o.id) ?? [],
      matched_test_names: [...matched],
      score: Math.round(score),
      reason: reasonParts.join(" · "),
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Try to find a portal order that ALREADY has Mayo's identifiers
 * stamped on it (accession, specimen, or MRN — from a prior match
 * that got back-stamped, or from Pipeline 1's historical CSV run).
 * Returns the first order.id that hits any of the three keys; the
 * caller can then auto-match with 100% confidence, skipping the
 * scored candidate flow entirely.
 */
export async function findByPrimaryKeys(
  service: SupabaseClient,
  keys: {
    mayo_ml_order_number?: string | null;
    mayo_order_number?: string | null;
    mayo_patient_id?: string | null;
  },
): Promise<string | null> {
  const { mayo_ml_order_number, mayo_order_number, mayo_patient_id } = keys;

  // Most specific first: ML accession, then WEB specimen, then MRN
  // (MRN can match multiple orders — we don't auto-match on MRN
  // alone; caller falls through to scored candidates for those).
  if (mayo_ml_order_number) {
    const { data } = await service
      .from("orders")
      .select("id")
      .eq("mayo_ml_order_number", mayo_ml_order_number)
      .limit(1)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  if (mayo_order_number) {
    const { data } = await service
      .from("orders")
      .select("id")
      .eq("mayo_order_number", mayo_order_number)
      .limit(1)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  if (mayo_patient_id) {
    // MRN is patient-level, not order-level — only auto-match when
    // exactly one order for this MRN exists (otherwise ambiguous).
    const { data } = await service
      .from("orders")
      .select("id")
      .eq("mayo_patient_id", mayo_patient_id)
      .limit(2);
    const rows = (data ?? []) as Array<{ id: string }>;
    if (rows.length === 1) return rows[0].id;
  }
  return null;
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
