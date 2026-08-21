import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { backfillStripeFees } from "@/lib/stripe/fees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/backfill-stripe-fees
 *
 * Nightly cron that fills in `stripe_fee_cad` on any order missing
 * it. Bounded to 200 orders per run so the function stays under its
 * timeout and Stripe's API rate limit. Repeated runs catch up any
 * backlog; steady-state each run should touch only new orders.
 *
 * Auth: Bearer <CRON_SECRET> (Vercel cron).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServiceRoleClient();
  const result = await backfillStripeFees(service, 200);
  return NextResponse.json({ ok: true, ...result });
}
