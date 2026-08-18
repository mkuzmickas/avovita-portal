import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parseFloLabsEmail } from "@/lib/calendar/parse-flolabs-email";
import {
  findCandidateOrders,
  shouldAutoAssign,
} from "@/lib/calendar/find-candidates";
import { resend } from "@/lib/resend";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/bookings/flolabs-inbound
 *
 * Webhook target for a Power Automate rule on Mike's Outlook:
 *   "When email arrives from no-reply@acuityscheduling.com with
 *    subject starting 'Confirmation of Booking: AvoVita', POST body
 *    to this URL."
 *
 * Body: { rawEmail: string, subject?: string, from?: string }
 * Header: `x-bookings-token: <BOOKINGS_INBOUND_TOKEN env var>`
 *
 * Every inbound email creates a booking_events row for audit. If the
 * parser finds a high-confidence match (email match, top by >=40 over
 * second) the order's appointment_at gets set automatically and the
 * event resolution is 'auto_assigned'. Anything ambiguous is left as
 * 'needs_review' and appears in the /admin/bookings/queue for Jenna,
 * with a heads-up email to Mike so nothing sits unattended.
 */

const TOKEN_HEADER = "x-bookings-token";

export async function POST(request: NextRequest) {
  const expected = process.env.BOOKINGS_INBOUND_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "Server missing BOOKINGS_INBOUND_TOKEN env var." },
      { status: 503 },
    );
  }
  const providedToken =
    request.headers.get(TOKEN_HEADER) ??
    new URL(request.url).searchParams.get("token");
  if (providedToken !== expected) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  // Accept the body in three shapes so Power Automate flows work
  // whether the Body field is a proper JSON object, a JSON-looking
  // string, or (the easiest to set up) the trigger's raw email body
  // + subject + from concatenated together as plain text.
  const rawBody = await request.text();
  let body: { rawEmail?: string; subject?: string; from?: string } = {};
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object") {
      body = parsed as typeof body;
    }
  } catch {
    // Not JSON — treat the whole body as the concatenated email blob.
    body = { rawEmail: rawBody };
  }

  const rawEmail = [
    body.subject ? `Subject: ${body.subject}` : "",
    body.from ? `From: ${body.from}` : "",
    body.rawEmail ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!rawEmail.trim()) {
    return NextResponse.json(
      { error: "rawEmail (or subject/from) is required." },
      { status: 400 },
    );
  }

  const parsed = parseFloLabsEmail(rawEmail);
  const service = createServiceRoleClient();
  const candidates = await findCandidateOrders(service, parsed);

  const autoAssign = parsed.appointmentAtISO && shouldAutoAssign(candidates);
  let resolution: string = candidates.length === 0 ? "no_match" : "needs_review";
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

    if (updateErr) {
      console.warn(
        `[flolabs-inbound] auto-assign update failed for ${top.orderId}:`,
        updateErr.message,
      );
      // Fall through — log as needs_review so Jenna can manually confirm.
    } else {
      resolution = "auto_assigned";
      matchedOrderId = top.orderId;
      matchScore = top.matchScore;
      matchedBy = top.matchedBy;
    }
  }

  // Persist the event regardless of outcome.
  const { data: eventRow } = await service
    .from("booking_events")
    .insert({
      raw_email: rawEmail.slice(0, 40000),
      parsed_client_name: parsed.clientName,
      parsed_client_email: parsed.clientEmail,
      parsed_client_phone: parsed.clientPhone,
      parsed_appointment_at: parsed.appointmentAtISO,
      parsed_address: parsed.address,
      parse_warnings: parsed.warnings,
      resolution,
      matched_order_id: matchedOrderId,
      match_score: matchScore,
      match_matched_by: matchedBy,
      candidate_snapshot: candidates.slice(0, 5),
    })
    .select("id")
    .single();

  // If Jenna needs to review, ping Mike so it doesn't sit unnoticed.
  if (resolution !== "auto_assigned") {
    try {
      const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
      await resend.emails.send({
        from: "AvoVita Bookings <noreply@notify.avovita.ca>",
        to: "mike@avovita.ca",
        subject: `[Booking needs review] ${parsed.clientName ?? "Unknown"} — ${formatShort(parsed.appointmentAtISO)}`,
        html: `
          <p>A FloLabs confirmation arrived that couldn't be auto-matched.</p>
          <p>
            <strong>Client:</strong> ${escapeHtml(parsed.clientName ?? "?")}<br>
            <strong>Email:</strong> ${escapeHtml(parsed.clientEmail ?? "?")}<br>
            <strong>Phone:</strong> ${escapeHtml(parsed.clientPhone ?? "?")}<br>
            <strong>When:</strong> ${escapeHtml(formatShort(parsed.appointmentAtISO))}<br>
            <strong>Resolution:</strong> ${resolution}<br>
            <strong>Candidate count:</strong> ${candidates.length}
          </p>
          <p><a href="${url}/admin/bookings/queue">Open review queue</a></p>
        `,
      });
    } catch (err) {
      console.warn("[flolabs-inbound] notification email failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    event_id: eventRow?.id ?? null,
    resolution,
    matched_order_id: matchedOrderId,
    appointment_at: parsed.appointmentAtISO,
  });
}

function formatShort(iso: string | null): string {
  if (!iso) return "?";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
