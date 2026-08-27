import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedFloLabsEmail } from "./parse-flolabs-email";

/**
 * Match a parsed FloLabs booking to unscheduled AvoVita orders.
 *
 * Scoring:
 *   +100  account email exact match
 *   +60   account phone match
 *   +40   patient phone match
 *   +20   account or patient last-name match
 *
 * Threshold for auto-assign (webhook path):
 *   - Top candidate >= 100 (email match)
 *   - AND either only one candidate, or top score > second by >= 40
 *
 * Anything below that ends up in the review queue for Jenna.
 */

export interface CandidateOrder {
  orderId: string;
  totalCad: number | null;
  createdAt: string;
  accountEmail: string | null;
  accountName: string | null;
  patientNames: string[];
  tests: string[];
  matchScore: number;
  matchedBy: string[];
}

export const AUTO_ASSIGN_MIN_SCORE = 100;
export const AUTO_ASSIGN_MIN_LEAD_OVER_SECOND = 40;

export async function findCandidateOrders(
  service: SupabaseClient,
  parsed: ParsedFloLabsEmail,
  { limit = 8 }: { limit?: number } = {},
): Promise<CandidateOrder[]> {
  type CandidateRow = {
    id: string;
    total_cad: number | null;
    created_at: string;
    account_id: string;
    accounts: {
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
    } | null;
    order_lines: Array<{
      line_type: string;
      tests: { name: string; sku: string | null } | null;
      patient_profiles: {
        first_name: string;
        last_name: string;
        phone: string | null;
      } | null;
    }>;
  };

  const emailLower = parsed.clientEmail?.toLowerCase();
  const phone = parsed.clientPhone;
  const lastNameLower = parsed.clientName?.split(/\s+/).pop()?.toLowerCase();

  // Match against every recent order regardless of scheduled state.
  // Split into three simple queries instead of one nested join so a
  // schema/RLS quirk in any single join doesn't kill the whole match
  // silently. Errors surface in logs so we know what's broken.
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

  const { data: orderRows, error: ordersErr } = await service
    .from("orders")
    .select("id, total_cad, created_at, appointment_at, account_id")
    .gte("created_at", sixMonthsAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  if (ordersErr || !orderRows) {
    console.error(
      "[find-candidates] orders query failed:",
      ordersErr?.message ?? "no data",
    );
    return [];
  }
  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((o) => o.id);
  const accountIds = Array.from(new Set(orderRows.map((o) => o.account_id).filter(Boolean)));

  // Accounts lookup — email/phone/name lives here for the buyer.
  const { data: accountRows, error: accountsErr } = await service
    .from("accounts")
    .select("id, email, first_name, last_name, phone")
    .in("id", accountIds);
  if (accountsErr) {
    console.error("[find-candidates] accounts query failed:", accountsErr.message);
  }
  const accountsById = new Map<string, {
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  }>();
  for (const a of (accountRows ?? []) as Array<{
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  }>) {
    accountsById.set(a.id, a);
  }

  // Primary-profile lookup keyed by account — a display fallback for
  // orders whose test lines don't have joined patient_profiles (invoice-
  // mirrored orders on custom or resource lines, order_lines with a
  // stale profile_id, etc.). Without this the candidate card renders
  // as "Unknown" even when the profile clearly exists on the account.
  const { data: primaryProfileRows } = await service
    .from("patient_profiles")
    .select("account_id, first_name, last_name")
    .in("account_id", accountIds)
    .eq("is_primary", true);
  const primaryProfileByAccount = new Map<
    string,
    { first_name: string | null; last_name: string | null }
  >();
  for (const p of (primaryProfileRows ?? []) as Array<{
    account_id: string;
    first_name: string | null;
    last_name: string | null;
  }>) {
    primaryProfileByAccount.set(p.account_id, {
      first_name: p.first_name,
      last_name: p.last_name,
    });
  }

  // Order lines with joined tests + patient profiles.
  const { data: lineRows, error: linesErr } = await service
    .from("order_lines")
    .select(
      "order_id, line_type, tests:tests(name, sku), patient_profiles:patient_profiles(first_name, last_name, phone)",
    )
    .in("order_id", orderIds);
  if (linesErr) {
    console.error("[find-candidates] order_lines query failed:", linesErr.message);
  }

  type LineShape = {
    order_id: string;
    line_type: string;
    tests: { name: string; sku: string | null } | { name: string; sku: string | null }[] | null;
    patient_profiles: {
      first_name: string;
      last_name: string;
      phone: string | null;
    } | { first_name: string; last_name: string; phone: string | null }[] | null;
  };
  const linesByOrder = new Map<string, Array<{
    line_type: string;
    tests: { name: string; sku: string | null } | null;
    patient_profiles: {
      first_name: string;
      last_name: string;
      phone: string | null;
    } | null;
  }>>();
  for (const l of (lineRows ?? []) as LineShape[]) {
    const arr = linesByOrder.get(l.order_id) ?? [];
    arr.push({
      line_type: l.line_type,
      tests: Array.isArray(l.tests) ? l.tests[0] ?? null : l.tests ?? null,
      patient_profiles: Array.isArray(l.patient_profiles)
        ? l.patient_profiles[0] ?? null
        : l.patient_profiles ?? null,
    });
    linesByOrder.set(l.order_id, arr);
  }

  // Stitch into CandidateRow shape for the rest of the function.
  const rows: CandidateRow[] = orderRows.map((o) => ({
    id: o.id as string,
    total_cad: (o.total_cad as number | null) ?? null,
    created_at: o.created_at as string,
    account_id: o.account_id as string,
    accounts: accountsById.get(o.account_id as string) ?? null,
    order_lines: linesByOrder.get(o.id as string) ?? [],
  }));

  const scored = rows.map((r) => {
    let score = 0;
    const matchedBy: string[] = [];
    if (emailLower && r.accounts?.email?.toLowerCase() === emailLower) {
      score += 100;
      matchedBy.push("email");
    }
    const acctPhone = digitsOnly(r.accounts?.phone ?? "");
    if (phone && acctPhone && stripPlus(acctPhone) === stripPlus(phone)) {
      score += 60;
      matchedBy.push("account phone");
    }
    if (phone) {
      for (const line of r.order_lines) {
        const p = digitsOnly(line.patient_profiles?.phone ?? "");
        if (p && stripPlus(p) === stripPlus(phone)) {
          score += 40;
          matchedBy.push("patient phone");
          break;
        }
      }
    }
    if (lastNameLower) {
      const acctLast = r.accounts?.last_name?.toLowerCase() ?? "";
      if (acctLast === lastNameLower) {
        score += 20;
        matchedBy.push("account last name");
      }
      for (const line of r.order_lines) {
        const pl = line.patient_profiles?.last_name?.toLowerCase() ?? "";
        if (pl === lastNameLower) {
          score += 20;
          matchedBy.push("patient last name");
          break;
        }
      }
      // Fallback for invoice-mirrored orders whose test lines don't
      // have a joined patient_profiles row: score against the account's
      // primary profile last name so Dean-style orders still match.
      const primary = primaryProfileByAccount.get(r.account_id);
      if (
        primary?.last_name &&
        primary.last_name.toLowerCase() === lastNameLower &&
        !matchedBy.includes("patient last name")
      ) {
        score += 20;
        matchedBy.push("primary profile last name");
      }
    }
    return { row: r, score, matchedBy };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => {
    const testLines = s.row.order_lines.filter(
      (l) => l.line_type === "test" && l.tests,
    );
    const patientNames = Array.from(
      new Set(
        testLines
          .map((l) =>
            l.patient_profiles
              ? `${l.patient_profiles.first_name} ${l.patient_profiles.last_name}`.trim()
              : null,
          )
          .filter((v): v is string => !!v),
      ),
    );
    return {
      orderId: s.row.id,
      totalCad: s.row.total_cad,
      createdAt: s.row.created_at,
      accountEmail: s.row.accounts?.email ?? null,
      accountName:
        [s.row.accounts?.first_name, s.row.accounts?.last_name]
          .filter(Boolean)
          .join(" ") ||
        (() => {
          const p = primaryProfileByAccount.get(s.row.account_id);
          const label = [p?.first_name, p?.last_name]
            .filter(Boolean)
            .join(" ");
          return label.length > 0 ? label : null;
        })(),
      patientNames,
      tests: testLines
        .map((l) => l.tests?.name)
        .filter((v): v is string => !!v),
      matchScore: s.score,
      matchedBy: s.matchedBy,
    };
  });
}

export function shouldAutoAssign(candidates: CandidateOrder[]): boolean {
  if (candidates.length === 0) return false;
  const top = candidates[0];
  if (top.matchScore < AUTO_ASSIGN_MIN_SCORE) return false;
  if (candidates.length === 1) return true;
  const secondScore = candidates[1].matchScore;
  return top.matchScore - secondScore >= AUTO_ASSIGN_MIN_LEAD_OVER_SECOND;
}

function digitsOnly(p: string): string {
  return p.replace(/[^\d+]/g, "");
}
function stripPlus(p: string): string {
  return p.replace(/^\+/, "");
}
