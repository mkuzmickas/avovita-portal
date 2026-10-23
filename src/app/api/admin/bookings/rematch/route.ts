import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  findCandidateOrders,
  shouldAutoAssign,
} from "@/lib/calendar/find-candidates";
import { parseFloLabsEmail } from "@/lib/calendar/parse-flolabs-email";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/bookings/rematch
 *
 * (1) Re-parses the stored raw_email with the current parser (fixes
 *     rows ingested before a parser upgrade — e.g. Oct 2026 CST tz
 *     support means every pre-Oct-20 CST booking_event has a null
 *     parsed_appointment_at that re-parsing recovers).
 * (2) Re-runs the matcher against the fresh parse.
 * (3) If the matcher now auto-assigns, stamps appointment_at on the
 *     matched order and flips the booking_event row to auto_assigned.
 *     Otherwise refreshes the candidate list so Jenna can pick from
 *     the UI.
 *
 * Admin-only.
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
      "id, raw_email, parsed_client_name, parsed_client_email, parsed_client_phone, parsed_appointment_at, parsed_address, parse_warnings",
    )
    .eq("id", body.bookingEventId)
    .single();
  if (fetchErr || !eventRow) {
    return NextResponse.json(
      { error: "Booking event not found." },
      { status: 404 },
    );
  }

  // Re-parse the raw email so parser upgrades (new TZ handling, new
  // Acuity template support, etc.) retroactively fix stuck rows. If
  // the row never captured a raw email (very old rows), fall back to
  // the stored parsed_* fields so this endpoint stays useful as a
  // candidate-refresh.
  const rawEmail = (eventRow.raw_email as string | null) ?? null;
  const parsed = rawEmail
    ? parseFloLabsEmail(rawEmail)
    : {
        clientName: eventRow.parsed_client_name as string | null,
        clientEmail: eventRow.parsed_client_email as string | null,
        clientPhone: eventRow.parsed_client_phone as string | null,
        address: eventRow.parsed_address as string | null,
        appointmentAtISO: eventRow.parsed_appointment_at as string | null,
        rawSubjectLine: null,
        warnings: (eventRow.parse_warnings as string[]) ?? [],
      };

  const candidates = await findCandidateOrders(service, parsed);
  const autoAssign =
    parsed.appointmentAtISO && shouldAutoAssign(candidates);

  let resolution: "auto_assigned" | "needs_review" | "no_match" =
    candidates.length === 0 ? "no_match" : "needs_review";
  let matchedOrderId: string | null = null;
  let matchScore: number | null = null;
  let matchedBy: string[] = [];

  if (autoAssign && candidates.length > 0 && parsed.appointmentAtISO) {
    const top = candidates[0];
    const start = new Date(parsed.appointmentAtISO);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const { error: updateErr } = await service
      .from("orders")
      .update({
        appointment_at: start.toISOString(),
        appointment_end_at: end.toISOString(),
        appointment_date: start.toISOString().slice(0, 10),
      })
      .eq("id", top.orderId);
    if (!updateErr) {
      resolution = "auto_assigned";
      matchedOrderId = top.orderId;
      matchScore = top.matchScore;
      matchedBy = top.matchedBy;
    }
  }

  await service
    .from("booking_events")
    .update({
      parsed_client_name: parsed.clientName,
      parsed_client_email: parsed.clientEmail,
      parsed_client_phone: parsed.clientPhone,
      parsed_appointment_at: parsed.appointmentAtISO,
      parsed_address: parsed.address,
      parse_warnings: parsed.warnings,
      candidate_snapshot: candidates.slice(0, 8),
      resolution,
      matched_order_id: matchedOrderId,
      match_score: matchScore,
      match_matched_by: matchedBy,
    })
    .eq("id", body.bookingEventId);

  return NextResponse.json({
    ok: true,
    candidates_found: candidates.length,
    top_score: candidates[0]?.matchScore ?? 0,
    resolution,
    reparsed: !!rawEmail,
    appointment_at: parsed.appointmentAtISO,
  });
}
