import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/remind-unconfirmed
 *
 * Retired. The original cron sent daily magic-link reminders to
 * unconfirmed Supabase users. With passwords mandatory at checkout
 * and email_confirm: true at account creation, there are no longer
 * any "unconfirmed" users in the pipeline — and the reminder emails
 * caused the very link-expired loop the password gate was built to
 * fix. The endpoint is left in place so the Vercel Cron schedule
 * doesn't 404 on its next fire; it returns 200 with a no-op payload.
 *
 * To fully retire: also remove the entry from vercel.json's `crons`
 * array.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    retired: true,
    reason:
      "Magic-link confirmation reminders were retired when passwords became mandatory at checkout.",
  });
}
