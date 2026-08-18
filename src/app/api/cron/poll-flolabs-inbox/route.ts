import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { pollFloLabsInbox } from "@/lib/microsoft/poll-flolabs-inbox";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/poll-flolabs-inbox
 *
 * Vercel cron endpoint — runs every 5 minutes (vercel.json). Reads
 * unread Acuity confirmations from Mike's Outlook via Microsoft Graph,
 * matches each one to an order, and either auto-assigns or drops it
 * in the review queue. Marks processed emails as read so subsequent
 * polls skip them.
 *
 * Auth: Vercel cron jobs are called by Vercel's infrastructure with
 * a bearer token equal to CRON_SECRET. Public callers get 401.
 * Manual admin trigger (for testing) is allowed with the same secret.
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  try {
    const result = await pollFloLabsInbox(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[poll-flolabs-inbox] cron failed:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
