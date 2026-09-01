import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphFetch } from "./graph";
import { parseFloLabsEmail } from "@/lib/calendar/parse-flolabs-email";
import {
  findCandidateOrders,
  shouldAutoAssign,
} from "@/lib/calendar/find-candidates";
import { resend } from "@/lib/resend";

/**
 * Poll Mike's Outlook inbox for FloLabs Acuity confirmation emails
 * and ingest each one via the same pipeline as the manual paste flow:
 * parse -> match -> auto-assign or queue for review.
 *
 * Called from /api/cron/poll-flolabs-inbox on a 5-min Vercel cron.
 * Idempotent — booking_events.outlook_message_id is unique so a
 * re-poll of an already-processed message is a no-op.
 *
 * After successful processing, the email is marked as read so future
 * polls skip it via the isRead filter. We do NOT delete or move the
 * email — Mike keeps his normal Outlook copy for archive/search.
 */

interface GraphMessage {
  id: string;
  subject: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  bodyPreview?: string;
  body?: { contentType?: "html" | "text"; content?: string };
  receivedDateTime?: string;
  isRead?: boolean;
}

interface GraphMessagesResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
}

export interface PollResult {
  scanned: number;
  processed: number;
  autoAssigned: number;
  needsReview: number;
  noMatch: number;
  skippedDuplicates: number;
  errors: Array<{ messageId: string; error: string }>;
}

const SENDER_FILTER = "no-reply@acuityscheduling.com";
// Acuity ships several confirmation email templates that all reach
// this inbox. Each Avovita-related booking uses one of these subject
// prefixes:
//   - "Confirmation of Booking: AvoVita ..." — original scheduling template
//   - "Appointment Scheduled" — newer scheduling template used since ~Aug 2026
//   - "Appointment Rescheduled" — reschedule flow
//   - "Appointment Canceled" — cancel flow (parser will no-match; we still
//     want the booking_events row so future automation can act on it)
// Adding a subject to this list is the whole activation for the
// corresponding template — parser support is separately handled in
// parse-flolabs-email.ts.
const SUBJECT_PREFIXES = [
  "Confirmation of Booking: AvoVita",
  "Appointment Scheduled",
  "Appointment Rescheduled",
  "Appointment Canceled",
];
const PAGE_SIZE = 50;
// Look back 7 days regardless of read state — Mike or an Outlook rule
// can read a confirmation before the 5-min cron fires, and the old
// `isRead eq false` filter dropped everything already read. Dedup is
// enforced by booking_events.outlook_message_id (unique index) so
// re-scanning read messages is safe and a no-op on the DB.
const LOOKBACK_DAYS = 7;

export async function pollFloLabsInbox(
  supabase: SupabaseClient,
): Promise<PollResult> {
  const result: PollResult = {
    scanned: 0,
    processed: 0,
    autoAssigned: 0,
    needsReview: 0,
    noMatch: 0,
    skippedDuplicates: 0,
    errors: [],
  };

  // Query: recent (last 7 days) messages from Acuity with matching
  // subject prefix. Graph's $filter can't do startsWith on subject
  // in some tenants reliably, so we filter server-side on sender +
  // received date and check subject in code.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffISO = cutoff.toISOString();
  const filter = [
    `receivedDateTime ge ${cutoffISO}`,
    `from/emailAddress/address eq '${SENDER_FILTER}'`,
  ].join(" and ");
  const path = `/messages?$filter=${encodeURIComponent(filter)}&$top=${PAGE_SIZE}&$orderby=${encodeURIComponent("receivedDateTime desc")}&$select=id,subject,from,body,receivedDateTime,isRead`;

  const data = await graphFetch<GraphMessagesResponse>(path);
  result.scanned = data.value.length;

  for (const msg of data.value) {
    const subject = msg.subject ?? "";
    if (!SUBJECT_PREFIXES.some((p) => subject.startsWith(p))) continue;
    result.processed++;

    // Dedup check: if we've already got a booking_events row for this
    // message.id, skip. The unique index on outlook_message_id also
    // guards on insert, but doing it here saves the Graph mark-as-read
    // call from firing on a no-op.
    const { data: existing } = await supabase
      .from("booking_events")
      .select("id")
      .eq("outlook_message_id", msg.id)
      .maybeSingle();
    if (existing) {
      result.skippedDuplicates++;
      await markAsRead(msg.id);
      continue;
    }

    try {
      const outcome = await processOneMessage(supabase, msg);
      if (outcome === "auto_assigned") result.autoAssigned++;
      else if (outcome === "needs_review") result.needsReview++;
      else if (outcome === "no_match") result.noMatch++;
      await markAsRead(msg.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[poll-flolabs] Failed to process message ${msg.id}: ${message}`,
      );
      result.errors.push({ messageId: msg.id, error: message });
      // Leave unread so next poll retries. If a message keeps failing
      // it'll error every 5 min — visible in logs, actionable.
    }
  }

  return result;
}

async function processOneMessage(
  supabase: SupabaseClient,
  msg: GraphMessage,
): Promise<"auto_assigned" | "needs_review" | "no_match"> {
  const bodyContent = msg.body?.content ?? msg.bodyPreview ?? "";
  const fromAddress = msg.from?.emailAddress?.address ?? "";

  const rawEmail = [
    `Subject: ${msg.subject ?? ""}`,
    `From: ${fromAddress}`,
    "",
    bodyContent,
  ].join("\n");

  const parsed = parseFloLabsEmail(rawEmail);
  const candidates = await findCandidateOrders(supabase, parsed);

  const autoAssign = parsed.appointmentAtISO && shouldAutoAssign(candidates);
  let resolution: string = candidates.length === 0 ? "no_match" : "needs_review";
  let matchedOrderId: string | null = null;
  let matchScore: number | null = null;
  let matchedBy: string[] = [];

  if (autoAssign && candidates.length > 0 && parsed.appointmentAtISO) {
    const top = candidates[0];
    const start = new Date(parsed.appointmentAtISO);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const { error: updateErr } = await supabase
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

  await supabase.from("booking_events").insert({
    source: "outlook_poll",
    outlook_message_id: msg.id,
    received_at: msg.receivedDateTime ?? new Date().toISOString(),
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
  });

  if (resolution !== "auto_assigned") {
    // Best-effort admin notification; swallow email errors so poll
    // continues processing subsequent messages.
    try {
      const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
      await resend.emails.send({
        from: "AvoVita Bookings <noreply@notify.avovita.ca>",
        to: "mike@avovita.ca",
        subject: `[Booking needs review] ${parsed.clientName ?? "Unknown"} — ${formatShort(parsed.appointmentAtISO)}`,
        html: `<p>A FloLabs confirmation couldn't auto-match.</p>
               <p><strong>${escapeHtml(parsed.clientName ?? "?")}</strong> · ${escapeHtml(parsed.clientEmail ?? "?")} · ${escapeHtml(formatShort(parsed.appointmentAtISO))}</p>
               <p><a href="${url}/admin/bookings/queue">Open review queue</a></p>`,
      });
    } catch {
      /* non-fatal */
    }
  }

  return resolution as "auto_assigned" | "needs_review" | "no_match";
}

async function markAsRead(messageId: string): Promise<void> {
  await graphFetch(`/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ isRead: true }),
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
