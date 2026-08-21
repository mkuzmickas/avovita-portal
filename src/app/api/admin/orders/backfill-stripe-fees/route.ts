import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { backfillStripeFees } from "@/lib/stripe/fees";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/orders/backfill-stripe-fees
 *
 * Body: { limit?: number }  (default 100, max 500)
 *
 * Fetches Stripe processing fees for orders that don't have one stored
 * yet. Bounded per call so one run doesn't blow through Stripe's rate
 * limit or Vercel's function timeout. Call multiple times to backfill
 * a large history; the nightly cron will pick up any stragglers.
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

  let body: { limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok */
  }
  const limit = Math.min(500, Math.max(1, Number(body.limit) || 100));

  const service = createServiceRoleClient();
  const result = await backfillStripeFees(service, limit);
  return NextResponse.json({ ok: true, ...result });
}
