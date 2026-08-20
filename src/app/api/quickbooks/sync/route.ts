import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { syncQboTransactions } from "@/lib/quickbooks/sync";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/quickbooks/sync
 *
 * Admin-triggered pull. Defaults to the last 90 days (Intuit rate
 * limits are generous but pulling multi-year on every click wastes
 * quota; the nightly cron covers steady-state).
 *
 * Body: { sinceDate?: 'YYYY-MM-DD' }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  let body: { sinceDate?: string } = {};
  try {
    body = await request.json();
  } catch {
    // no body is fine
  }
  const sinceDate =
    body.sinceDate ??
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const service = createServiceRoleClient();
  try {
    const result = await syncQboTransactions(service, sinceDate);
    return NextResponse.json({ ok: true, sinceDate, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[qbo:sync] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
