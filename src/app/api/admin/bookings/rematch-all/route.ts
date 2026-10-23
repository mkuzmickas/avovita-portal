import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  findCandidateOrders,
  shouldAutoAssign,
} from "@/lib/calendar/find-candidates";
import { parseFloLabsEmail } from "@/lib/calendar/parse-flolabs-email";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/bookings/rematch-all
 *
 * Bulk re-parse + re-match every unresolved booking_events row
 * (resolution in ['needs_review', 'no_match']). For each row:
 *
 *   1. Re-parse the stored raw_email with the current parser so a
 *      parser upgrade (new TZ handling, new Acuity template support)
 *      retroactively fixes rows ingested under the old parser.
 *   2. Re-run the candidate matcher.
 *   3. Auto-assign if the matcher clears and we now have a valid
 *      appointmentAtISO.
 *
 * Returns per-resolution counters so Mike can see at a glance how
 * many stuck rows were recovered.
 *
 * Admin-only. Capped at 60s via maxDuration — the queue rarely has
 * more than a few dozen unresolved rows so this is comfortable.
 */
export async function POST(_request: NextRequest) {
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

  const service = createServiceRoleClient();

  // Pull every unresolved row. Order by received_at ASC so if we hit
  // the 60s cap we've at least made progress on the oldest ones.
  const { data: eventsRaw } = await service
    .from("booking_events")
    .select("id, raw_email")
    .in("resolution", ["needs_review", "no_match"])
    .order("received_at", { ascending: true })
    .limit(500);

  const events = (eventsRaw ?? []) as Array<{
    id: string;
    raw_email: string | null;
  }>;

  const counters = {
    scanned: events.length,
    reparsed: 0,
    auto_assigned: 0,
    still_needs_review: 0,
    still_no_match: 0,
    errored: 0,
  };

  for (const ev of events) {
    try {
      // Skip rows with no raw email captured — re-parsing can't help.
      if (!ev.raw_email) {
        counters.still_needs_review++;
        continue;
      }
      const parsed = parseFloLabsEmail(ev.raw_email);
      counters.reparsed++;
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
        .eq("id", ev.id);

      if (resolution === "auto_assigned") counters.auto_assigned++;
      else if (resolution === "needs_review") counters.still_needs_review++;
      else counters.still_no_match++;
    } catch (err) {
      console.error(
        `[rematch-all] failed on booking_event ${ev.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      counters.errored++;
    }
  }

  return NextResponse.json({ ok: true, ...counters });
}
