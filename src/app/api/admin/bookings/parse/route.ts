import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { parseFloLabsEmail } from "@/lib/calendar/parse-flolabs-email";
import { findCandidateOrders } from "@/lib/calendar/find-candidates";
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
  const service = createServiceRoleClient();
  const candidateOrders = await findCandidateOrders(service, parsed);

  return NextResponse.json({
    parsed,
    candidates: candidateOrders,
  });
}
