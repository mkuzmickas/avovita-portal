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
  // The original filter (appointment_at IS NULL) excluded any order
  // that had ever had an appointment_date populated — which after
  // migration 034's backfill was essentially every historical order.
  // Real clients booking via FloLabs weren't matching because the
  // 8am placeholder appointment_at from the backfill made them look
  // 'already scheduled'. Recent-window cap keeps the query fast; old
  // orders (>180d) can be paste-matched manually if needed.
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

  const { data } = await service
    .from("orders")
    .select(
      `
        id,
        total_cad,
        created_at,
        appointment_at,
        account_id,
        accounts:accounts (email, first_name, last_name, phone),
        order_lines:order_lines (
          line_type,
          tests:tests (name, sku),
          patient_profiles:patient_profiles (first_name, last_name, phone)
        )
      `,
    )
    .gte("created_at", sixMonthsAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as CandidateRow[];

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
          .join(" ") || null,
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
