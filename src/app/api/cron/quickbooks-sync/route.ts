import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { syncQboTransactions } from "@/lib/quickbooks/sync";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/quickbooks-sync
 *
 * Runs nightly (Vercel Cron at 08:00 UTC = 02:00 MDT / 01:00 MST).
 * Pulls the trailing 30 days of QBO transactions — an intentionally
 * overlapping window that catches back-dated postings without a
 * bloated re-scan. Upserts are idempotent on (qbo_id, qbo_txn_type)
 * so the overlap costs nothing.
 *
 * Two ways to auth:
 *   1. Bearer <CRON_SECRET> — how Vercel Cron itself invokes.
 *   2. Admin session — same "click a button in the browser" escape
 *      hatch we use for the FloLabs poller, so Mike can trigger a
 *      manual sync without touching the CLI.
 *
 * If the integration row is missing (never connected / disconnected)
 * the sync short-circuits with a friendly message instead of throwing.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const cronOk = cronSecret && authHeader === `Bearer ${cronSecret}`;

  let sessionOk = false;
  if (!cronOk) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: account } = (await supabase
        .from("accounts")
        .select("role")
        .eq("id", user.id)
        .single()) as { data: Pick<Account, "role"> | null };
      sessionOk = account?.role === "admin";
    }
  }
  if (!cronOk && !sessionOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: integ } = await service
    .from("integrations")
    .select("provider")
    .eq("provider", "quickbooks")
    .maybeSingle();
  if (!integ) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "QuickBooks not connected.",
    });
  }

  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const result = await syncQboTransactions(service, sinceDate);
    return NextResponse.json({ ok: true, sinceDate, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[qbo:cron-sync] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
