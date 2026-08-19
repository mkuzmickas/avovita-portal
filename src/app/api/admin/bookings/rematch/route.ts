import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { findCandidateOrders } from "@/lib/calendar/find-candidates";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/bookings/rematch
 *
 * Re-runs the matcher against the current DB for an existing
 * booking_events row (using its stored parsed_* fields) and updates
 * candidate_snapshot in place. Useful when the matcher has been
 * improved after events were originally queued as no_match.
 *
 * Does NOT auto-assign — just refreshes the candidate list so Jenna
 * can pick from the UI. Admin-only.
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
  const { data: eventRow, error: fetchErr } = await service
    .from("booking_events")
    .select(
      "id, parsed_client_name, parsed_client_email, parsed_client_phone, parsed_appointment_at, parsed_address, parse_warnings",
    )
    .eq("id", body.bookingEventId)
    .single();
  if (fetchErr || !eventRow) {
    return NextResponse.json(
      { error: "Booking event not found." },
      { status: 404 },
    );
  }

  const parsed = {
    clientName: eventRow.parsed_client_name as string | null,
    clientEmail: eventRow.parsed_client_email as string | null,
    clientPhone: eventRow.parsed_client_phone as string | null,
    address: eventRow.parsed_address as string | null,
    appointmentAtISO: eventRow.parsed_appointment_at as string | null,
    rawSubjectLine: null,
    warnings: (eventRow.parse_warnings as string[]) ?? [],
  };

  const candidates = await findCandidateOrders(service, parsed);
  const newResolution =
    candidates.length === 0 ? "no_match" : "needs_review";

  await service
    .from("booking_events")
    .update({
      candidate_snapshot: candidates.slice(0, 8),
      resolution: newResolution,
    })
    .eq("id", body.bookingEventId);

  return NextResponse.json({
    ok: true,
    candidates_found: candidates.length,
    top_score: candidates[0]?.matchScore ?? 0,
    resolution: newResolution,
  });
}
