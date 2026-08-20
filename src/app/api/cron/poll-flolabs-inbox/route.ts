import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { pollFloLabsInbox } from "@/lib/microsoft/poll-flolabs-inbox";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/poll-flolabs-inbox
 *
 * Runs every 5 min via Vercel cron. Reads recent Acuity confirmations
 * from Mike's Outlook via Microsoft Graph, matches each to an order,
 * and either auto-assigns or drops it in the review queue.
 *
 * Auth accepts EITHER path:
 *   - Bearer CRON_SECRET header — how Vercel's cron scheduler calls it
 *   - Authenticated admin browser session — so Mike can force a
 *     manual poll by just visiting /api/cron/poll-flolabs-inbox
 *     while logged in as admin (bookmarkable, no secret to memorise)
 *
 * The endpoint is a read-then-write-with-dedup — worst-case abuse is
 * burning Graph API quota, so dual auth is safe.
 */

async function isAdminSession(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  return account?.role === "admin";
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const secretValid = !!secret && authHeader === `Bearer ${secret}`;
  const adminValid = !secretValid && (await isAdminSession());
  if (!secretValid && !adminValid) {
    return NextResponse.json(
      { error: "Not authorised — send CRON_SECRET bearer or sign in as admin." },
      { status: 401 },
    );
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
