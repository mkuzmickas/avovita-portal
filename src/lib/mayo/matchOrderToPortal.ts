/**
 * Matches a Mayo CSV row to a portal order using a tiered confidence
 * model. Shared between Pipeline 1 (Pending Batch CSV import) and
 * Pipeline 2 (result PDF triage) so both code paths reach the same
 * verdict on the same inputs.
 *
 * The function is "pure" against a small data-access port — it does
 * not pull from Supabase itself. The caller supplies a `repo` with
 * the lookups it needs; production code wires those to Supabase and
 * tests pass in-memory fakes. This is the only practical way to
 * unit-test matching logic without a database.
 *
 * Tiering:
 *   1. EXACT — mayo_order_number already stamped on a portal order.
 *      The row has been imported before; nothing else to do.
 *   2. PROFILE MATCH — name + DOB find exactly one portal profile.
 *      If multiple profiles match the same name+DOB the row is
 *      ambiguous and surfaces every candidate.
 *   3. ORDER SELECTION — for the matched profile, score open/incomplete
 *      orders on test-SKU overlap and (optionally) collection-date
 *      proximity. Highest scorer is the primary match; runners-up
 *      become alternatives shown in the UI.
 *
 * Confidence buckets:
 *   exact   — Mayo order number already stamped on an order, OR Mayo
 *             patient id already stamped on a profile and exactly one
 *             order has full SKU overlap.
 *   high    — single profile match, primary order has full SKU set
 *             match (superset or exact set).
 *   medium  — single profile match, primary order is a subset of CSV
 *             tests (some tests present, others missing).
 *   low     — profile match but no order has any SKU overlap, or
 *             multiple profiles match name+DOB.
 *   none    — no profile match at all.
 */

export interface MatchInput {
  last_name: string;
  first_name: string;
  /** Original DOB string from CSV ("30 Nov 1982") OR an ISO date
   *  (the engine normalizes both). */
  date_of_birth: string;
  /** SKUs extracted from the CSV "Tests Ordered" cell. Case
   *  preserved as Mayo writes them; we case-normalize on compare. */
  test_skus: string[];
  /** When known (e.g. on re-import of the same CSV), short-circuits
   *  to TIER 1 if it matches an existing portal order. */
  mayo_order_number?: string | null;
  /** When known, narrows TIER 3 to that patient's orders without
   *  needing a name+DOB lookup. */
  mayo_patient_id?: string | null;
  /** Optional collection date from the CSV — used as a tie-breaker
   *  when multiple orders for a profile have similar test overlap. */
  collection_date?: string | null;
}

export interface ProfileRow {
  id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  /** ISO YYYY-MM-DD (the column type is `date`). */
  date_of_birth: string;
  /** Already-stamped Mayo MRN, if any. */
  mayo_patient_id: string | null;
}

export interface OrderRow {
  id: string;
  profile_id: string | null;
  status: string;
  created_at: string;
  /** When set the matching engine treats this order as already
   *  stamped to Mayo and returns confidence='exact' in TIER 1. */
  mayo_order_number: string | null;
  mayo_patient_id: string | null;
  /** The SKUs of every test on this order (joined from order_lines). */
  test_skus: string[];
  /** Optional — if the order has a tied collection date in
   *  visit_groups or similar, the caller can supply it here for the
   *  proximity bonus. Null if unknown. */
  collection_date: string | null;
  /** Used to surface the profile name on the alternative; supplied
   *  by the caller for display purposes. */
  profile_label?: string;
}

export interface MatchRepo {
  /** Returns the order, if any, whose mayo_order_number equals the
   *  given value. */
  findOrderByMayoOrderNumber(value: string): Promise<OrderRow | null>;
  /** Returns the profile, if any, whose mayo_patient_id equals the
   *  given value. */
  findProfileByMayoPatientId(value: string): Promise<ProfileRow | null>;
  /** Returns every profile whose first+last+DOB match the input. The
   *  caller does the case-insensitive trim and date-normalize. */
  findProfilesByNameAndDob(
    first_name_lower: string,
    last_name_lower: string,
    dob_iso: string,
  ): Promise<ProfileRow[]>;
  /** Returns the non-cancelled orders for the given profile, with
   *  their order_lines test SKUs joined in. Implementations should
   *  filter to status != 'cancelled' so cancelled orders never match
   *  incoming Mayo results. */
  findOrdersForProfile(profile_id: string): Promise<OrderRow[]>;
}

export interface MatchCandidate {
  order_id: string;
  profile_id: string;
  score: number;
  reasoning: string;
}

export interface MatchResult {
  confidence: "exact" | "high" | "medium" | "low" | "none";
  primary_match: MatchCandidate | null;
  alternatives: MatchCandidate[];
  /** Human-readable notes — surfaced in the UI to help admins
   *  understand why the row landed where it did. */
  issues: string[];
}

// ─── Normalization helpers ────────────────────────────────────────────────

/** Parses "30 Nov 1982" / "Nov 30, 1982" / "1982-11-30" / ISO into a
 *  YYYY-MM-DD string. Returns null when the input cannot be parsed.
 *  Lives in this module (not date-fns) to keep the engine
 *  dependency-free for testing. */
export function normalizeDob(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };

  // "30 Nov 1982" or "30-Nov-1982"
  const dmy = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{4})$/);
  if (dmy) {
    const mo = months[dmy[2].slice(0, 3).toLowerCase()];
    if (mo) {
      return `${dmy[3]}-${String(mo).padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
  }

  // "Nov 30, 1982"
  const mdy = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const mo = months[mdy[1].slice(0, 3).toLowerCase()];
    if (mo) {
      return `${mdy[3]}-${String(mo).padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
    }
  }

  // "11/30/1982" — assume MDY (Mayo is US-formatted)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }

  // Last-ditch: let JS try. Avoids returning garbage on truly
  // unparseable input by returning null instead.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  return null;
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const s of a) if (b.has(s)) n++;
  return n;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Builds a candidate scoring result for one order. */
function scoreOrder(
  order: OrderRow,
  csvSkusNorm: Set<string>,
  csvCollectionIso: string | null,
): { score: number; reasonBits: string[]; cover: "exact" | "superset" | "subset" | "partial" | "none" } {
  const orderSkus = new Set(order.test_skus.map((s) => s.toUpperCase()));
  const overlap = overlapCount(csvSkusNorm, orderSkus);
  const csvSize = csvSkusNorm.size;
  const orderSize = orderSkus.size;
  const reasonBits: string[] = [];

  if (overlap === 0) {
    return { score: 0, reasonBits: ["no SKU overlap"], cover: "none" };
  }

  let cover: "exact" | "superset" | "subset" | "partial";
  let baseScore: number;
  if (overlap === csvSize && overlap === orderSize) {
    cover = "exact";
    baseScore = 100;
    reasonBits.push("exact test set match");
  } else if (overlap === csvSize && orderSize > csvSize) {
    cover = "superset";
    baseScore = 85;
    reasonBits.push(`all ${csvSize} CSV tests present (order has ${orderSize - csvSize} extra)`);
  } else if (overlap === orderSize && csvSize > orderSize) {
    cover = "subset";
    baseScore = 55;
    reasonBits.push(`order has ${orderSize} of the ${csvSize} CSV tests`);
  } else {
    cover = "partial";
    baseScore = 35;
    reasonBits.push(`${overlap} of ${csvSize} CSV tests overlap`);
  }

  // Collection date proximity bonus (max +10).
  if (csvCollectionIso && order.collection_date) {
    const csvDate = new Date(csvCollectionIso);
    const orderDate = new Date(order.collection_date);
    if (!isNaN(csvDate.getTime()) && !isNaN(orderDate.getTime())) {
      const days = daysBetween(csvDate, orderDate);
      if (days <= 1) {
        baseScore += 10;
        reasonBits.push(`collection date ${days === 0 ? "matches" : "1 day off"}`);
      } else if (days <= 7) {
        baseScore += 6;
        reasonBits.push(`collected within a week (${days} days off)`);
      } else if (days <= 30) {
        baseScore += 3;
        reasonBits.push(`collected within 30 days (${days} days off)`);
      } else {
        baseScore -= 5;
        reasonBits.push(`collection date ${days} days off`);
      }
    }
  }

  return { score: baseScore, reasonBits, cover };
}

// ─── Main entry point ─────────────────────────────────────────────────────

export async function matchOrderToPortal(
  input: MatchInput,
  repo: MatchRepo,
): Promise<MatchResult> {
  const issues: string[] = [];
  const csvSkusNorm = new Set(
    input.test_skus.map((s) => s.trim().toUpperCase()).filter(Boolean),
  );
  const csvCollectionIso = normalizeDob(input.collection_date ?? null);

  // ─── TIER 1: exact match on Mayo order number ─────────────────────
  if (input.mayo_order_number?.trim()) {
    const existing = await repo.findOrderByMayoOrderNumber(
      input.mayo_order_number.trim(),
    );
    if (existing) {
      return {
        confidence: "exact",
        primary_match: {
          order_id: existing.id,
          profile_id: existing.profile_id ?? "",
          score: 999,
          reasoning: `Already stamped — portal order matches Mayo order ${input.mayo_order_number.trim()}`,
        },
        alternatives: [],
        issues,
      };
    }
  }

  // ─── TIER 2: profile lookup ───────────────────────────────────────
  let candidateProfiles: ProfileRow[] = [];

  if (input.mayo_patient_id?.trim()) {
    const byMrn = await repo.findProfileByMayoPatientId(
      input.mayo_patient_id.trim(),
    );
    if (byMrn) {
      candidateProfiles = [byMrn];
    }
  }

  if (candidateProfiles.length === 0) {
    const dobIso = normalizeDob(input.date_of_birth);
    if (!dobIso) {
      return {
        confidence: "none",
        primary_match: null,
        alternatives: [],
        issues: [`Could not parse date of birth "${input.date_of_birth}"`],
      };
    }
    const firstLower = input.first_name.trim().toLowerCase();
    const lastLower = input.last_name.trim().toLowerCase();
    if (!firstLower || !lastLower) {
      return {
        confidence: "none",
        primary_match: null,
        alternatives: [],
        issues: ["Missing first or last name"],
      };
    }
    candidateProfiles = await repo.findProfilesByNameAndDob(
      firstLower,
      lastLower,
      dobIso,
    );
  }

  if (candidateProfiles.length === 0) {
    return {
      confidence: "none",
      primary_match: null,
      alternatives: [],
      issues: ["No portal profile with matching name + date of birth"],
    };
  }

  if (candidateProfiles.length > 1) {
    issues.push(
      `Multiple portal profiles match name + DOB (${candidateProfiles.length} candidates)`,
    );
  }

  // ─── TIER 3: rank orders within each candidate profile ────────────
  type Ranked = {
    candidate: MatchCandidate;
    cover: "exact" | "superset" | "subset" | "partial" | "none";
  };
  const ranked: Ranked[] = [];

  for (const profile of candidateProfiles) {
    const orders = await repo.findOrdersForProfile(profile.id);
    if (orders.length === 0) {
      issues.push(`Profile ${profile.first_name} ${profile.last_name} has no open orders`);
      continue;
    }
    for (const order of orders) {
      const scored = scoreOrder(order, csvSkusNorm, csvCollectionIso);
      // Drop zero-overlap candidates from consideration entirely — a
      // portal order with none of the CSV's tests is almost certainly
      // unrelated even if the patient matches.
      if (scored.cover === "none") continue;
      ranked.push({
        candidate: {
          order_id: order.id,
          profile_id: profile.id,
          score: scored.score,
          reasoning: `Patient match (${profile.first_name} ${profile.last_name}); ${scored.reasonBits.join("; ")}`,
        },
        cover: scored.cover,
      });
    }
  }

  if (ranked.length === 0) {
    return {
      confidence: candidateProfiles.length > 1 ? "low" : "none",
      primary_match: null,
      alternatives: [],
      issues: [
        ...issues,
        "Patient matched but no portal order contains any of the CSV's test SKUs",
      ],
    };
  }

  ranked.sort((a, b) => b.candidate.score - a.candidate.score);
  const top = ranked[0];
  const rest = ranked.slice(1).map((r) => r.candidate);

  // Confidence bucketing.
  let confidence: MatchResult["confidence"];
  if (candidateProfiles.length > 1) {
    // Ambiguous patient — even a strong test match can't lift us
    // above 'low'; admin must disambiguate which person this is.
    confidence = "low";
  } else if (top.cover === "exact" || top.cover === "superset") {
    confidence = "high";
  } else if (top.cover === "subset") {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    confidence,
    primary_match: top.candidate,
    alternatives: rest,
    issues,
  };
}
