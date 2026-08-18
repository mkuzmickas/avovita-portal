import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { parseFloLabsEmail } from "@/lib/calendar/parse-flolabs-email";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/bookings/parse
 *
 * Body: { rawEmail: string }
 * Returns: parsed fields + candidate orders (ranked by match confidence).
 *
 * Admin-only. Does not mutate anything — the paired /assign endpoint
 * writes the appointment_at column once the admin confirms which order
 * the email belongs to.
 */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 as const };
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") return { ok: false, status: 403 as const };
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Admin only." }, { status: auth.status });
  }

  let body: { rawEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const rawEmail = (body.rawEmail ?? "").trim();
  if (!rawEmail) {
    return NextResponse.json(
      { error: "rawEmail is required." },
      { status: 400 },
    );
  }

  const parsed = parseFloLabsEmail(rawEmail);

  // Find candidate orders. Match priority:
  //   1. Exact email match on accounts.email → any of their unmatched orders
  //   2. Exact phone match on patient_profiles.phone or accounts.phone
  //   3. Fuzzy last-name match
  // We only surface unmatched (appointment_at IS NULL) orders — nothing
  // to reassign here yet.
  const service = createServiceRoleClient();
  const candidateOrders = await findCandidateOrders(service, parsed);

  return NextResponse.json({
    parsed,
    candidates: candidateOrders,
  });
}

async function findCandidateOrders(
  service: ReturnType<typeof createServiceRoleClient>,
  parsed: ReturnType<typeof parseFloLabsEmail>,
) {
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
  const lastNameLower = parsed.clientName
    ?.split(/\s+/)
    .pop()
    ?.toLowerCase();

  const { data } = await service
    .from("orders")
    .select(
      `
        id,
        total_cad,
        created_at,
        account_id,
        accounts:accounts (email, first_name, last_name, phone),
        order_lines:order_lines (
          line_type,
          tests:tests (name, sku),
          patient_profiles:patient_profiles (first_name, last_name, phone)
        )
      `,
    )
    .is("appointment_at", null)
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = (data ?? []) as unknown as CandidateRow[];

  const scored = rows.map((r) => {
    let score = 0;
    const matchedBy: string[] = [];
    if (emailLower && r.accounts?.email?.toLowerCase() === emailLower) {
      score += 100;
      matchedBy.push("email");
    }
    const acctPhone = normalize(r.accounts?.phone ?? "");
    if (phone && acctPhone && stripPlus(acctPhone) === stripPlus(phone)) {
      score += 60;
      matchedBy.push("account phone");
    }
    if (phone) {
      for (const line of r.order_lines) {
        const p = normalize(line.patient_profiles?.phone ?? "");
        if (p && stripPlus(p) === stripPlus(phone)) {
          score += 40;
          matchedBy.push("patient phone");
          break;
        }
      }
    }
    if (lastNameLower) {
      const acctLast = r.accounts?.last_name?.toLowerCase() ?? "";
      if (acctLast && acctLast === lastNameLower) {
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

  return scored.slice(0, 8).map((s) => {
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

function normalize(p: string): string {
  return p.replace(/[^\d+]/g, "");
}
function stripPlus(p: string): string {
  return p.replace(/^\+/, "");
}
