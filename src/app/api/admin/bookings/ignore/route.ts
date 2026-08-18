import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/bookings/ignore
 *
 * Body: { bookingEventId: string }
 *
 * Marks a queued booking_event as 'ignored' so it drops off the
 * review queue without touching any order. Used when a confirmation
 * arrives for something we can't (or don't want to) match — e.g.
 * a test client, a duplicate email, or a booking placed outside
 * the portal flow.
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

  let body: { bookingEventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (!body.bookingEventId) {
    return NextResponse.json(
      { error: "bookingEventId required." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("booking_events")
    .update({
      resolution: "ignored",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", body.bookingEventId);

  if (error) {
    return NextResponse.json(
      { error: `Ignore failed: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
