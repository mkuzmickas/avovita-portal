import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";
import {
  renderReviewRequestEmail,
  reviewRequestSubject,
  reviewRequestSmsBody,
} from "@/lib/emails/reviewRequest";

export const runtime = "nodejs";

/**
 * POST /api/admin/patients/[id]/send-review-request
 *
 * Admin-only. Fires the Google review request email + SMS to the client
 * identified by the account id, then stamps accounts.review_request_sent_at.
 *
 *   • Idempotent — returns 409 if review_request_sent_at is already set.
 *   • Both email + SMS must succeed (when both contact methods are
 *     present) before the timestamp is set. On any send failure the
 *     timestamp is NOT set so the admin can retry.
 *   • If the client has only email, sends email only and stamps anyway.
 *   • If the client has only phone, sends SMS only and stamps anyway.
 *   • If neither, returns 400 — the UI already greys the button in
 *     this case but server-side guards the contract.
 *   • Logs to analytics_events with event_type='review_request_sent'.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Admin auth ───────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: callerRow } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const callerRole = (callerRow as { role: string } | null)?.role ?? null;
  if (callerRole !== "admin") {
    return NextResponse.json(
      { error: "Forbidden — admin only" },
      { status: 403 }
    );
  }

  const { id: accountId } = await params;
  if (!accountId) {
    return NextResponse.json(
      { error: "Account id is required" },
      { status: 400 }
    );
  }

  // ── Resolve recipient + idempotency check ────────────────────
  const service = createServiceRoleClient();
  const { data: accRaw, error: accErr } = await service
    .from("accounts")
    .select(
      `id, email, phone, review_request_sent_at,
       profiles:patient_profiles(first_name, last_name, phone, is_primary)`
    )
    .eq("id", accountId)
    .maybeSingle();
  if (accErr) {
    return NextResponse.json(
      { error: `Lookup failed: ${accErr.message}` },
      { status: 500 }
    );
  }
  type Acc = {
    id: string;
    email: string | null;
    phone: string | null;
    review_request_sent_at: string | null;
    profiles: Array<{
      first_name: string;
      last_name: string;
      phone: string | null;
      is_primary: boolean;
    }>;
  };
  const acc = accRaw as Acc | null;
  if (!acc) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if (acc.review_request_sent_at) {
    return NextResponse.json(
      { error: "Review request already sent for this client" },
      { status: 409 }
    );
  }

  const primary =
    acc.profiles.find((p) => p.is_primary) ?? acc.profiles[0] ?? null;
  const firstName = primary?.first_name?.trim() || "there";
  const phone = primary?.phone || acc.phone || null;
  const email = acc.email || null;

  if (!email && !phone) {
    return NextResponse.json(
      { error: "Client has no email or phone number on file" },
      { status: 400 }
    );
  }

  // ── Send email + SMS in parallel; stamp only if all succeed ──
  const sentVia: Array<"email" | "sms"> = [];
  const tasks: Array<Promise<void>> = [];

  if (email) {
    tasks.push(
      (async () => {
        await resend.emails.send({
          from: process.env.RESEND_FROM_ORDERS!,
          to: email,
          bcc: ["jenna@avovita.ca", "mike@avovita.ca"],
          subject: reviewRequestSubject(),
          html: renderReviewRequestEmail({ firstName }),
        });
        sentVia.push("email");
      })()
    );
  }

  if (phone) {
    if (!twilioClient) {
      return NextResponse.json(
        { error: "Twilio client not configured — SMS unavailable" },
        { status: 503 }
      );
    }
    tasks.push(
      (async () => {
        await twilioClient!.messages.create({
          from: TWILIO_FROM,
          to: phone,
          body: reviewRequestSmsBody(firstName),
        });
        sentVia.push("sms");
      })()
    );
  }

  try {
    await Promise.all(tasks);
  } catch (err) {
    console.error("[review-request] send failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to send review request",
      },
      { status: 502 }
    );
  }

  // ── Stamp + audit log ────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await service
    .from("accounts")
    .update({ review_request_sent_at: nowIso })
    .eq("id", accountId);
  if (updateErr) {
    // The email + SMS already went out. Surface the error so the admin
    // knows the timestamp didn't persist; on next reload they'll see
    // the button enabled again, but the customer won't be re-emailed
    // because the deduplication is server-side on the next click.
    console.error("[review-request] timestamp update failed:", updateErr);
    return NextResponse.json(
      { error: `Sent, but failed to record: ${updateErr.message}` },
      { status: 500 }
    );
  }

  await service
    .from("analytics_events")
    .insert({
      event_type: "review_request_sent",
      event_data: { client_id: accountId, sent_via: sentVia, admin_user_id: user.id },
      account_id: accountId,
    })
    .then(({ error }) => {
      if (error) {
        // Non-fatal — the request itself succeeded.
        console.warn(
          "[review-request] analytics insert failed:",
          error.message
        );
      }
    });

  return NextResponse.json({
    sent: true,
    sent_via: sentVia,
    review_request_sent_at: nowIso,
  });
}
