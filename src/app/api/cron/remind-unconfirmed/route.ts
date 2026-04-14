import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import { regenerateConfirmationLink } from "@/lib/auth/createGuestAccount";
import {
  renderConfirmReminderEmail,
  confirmReminderSubject,
} from "@/lib/emails/confirmEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_REMINDER_DAYS = 7;
const PORTAL_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
  try {
    return new URL(url).host;
  } catch {
    return "portal.avovita.ca";
  }
})();

/**
 * GET /api/cron/remind-unconfirmed
 *
 * Daily cron. For every Supabase auth user that:
 *   - has email_confirmed_at = null
 *   - was created between 24 hours and 7 days ago
 *   - has not received an email_confirm_reminder in the last 24 hours
 *
 * generates a fresh magic link via the admin API and emails a branded
 * reminder via Resend. Logs the attempt to the notifications table so
 * the next run can de-dupe.
 *
 * Authorisation: Bearer CRON_SECRET (Vercel Cron sends this header).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const now = Date.now();
  const cutoffMin = now - MAX_REMINDER_DAYS * 24 * 60 * 60 * 1000;
  const cutoffMax = now - REMINDER_INTERVAL_MS;

  // Pull unconfirmed users in the eligible window. Supabase admin doesn't
  // expose a direct query — paginate listUsers (caps at 200/page).
  const eligible: Array<{
    id: string;
    email: string;
    createdMs: number;
  }> = [];

  let page = 1;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.error("[remind-unconfirmed] listUsers error:", error.message);
      return NextResponse.json(
        { error: `listUsers failed: ${error.message}` },
        { status: 500 }
      );
    }
    for (const u of data.users) {
      if (u.email_confirmed_at) continue;
      if (!u.email) continue;
      const created = Date.parse(u.created_at);
      if (!Number.isFinite(created)) continue;
      if (created > cutoffMax) continue; // too new (less than 24h old)
      if (created < cutoffMin) continue; // too old (>7 days)
      eligible.push({ id: u.id, email: u.email, createdMs: created });
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, eligible: 0, sent: 0, skipped: 0 });
  }

  // Look up the latest reminder per account from notifications, so we can
  // skip users who already got one in the last 24h. One query, fed by the
  // eligible id list.
  const ids = eligible.map((e) => e.id);
  const { data: recentRaw } = await service
    .from("notifications")
    .select("account_id, sent_at, status")
    .eq("template", "email_confirm_reminder")
    .in("account_id", ids)
    .gte("sent_at", new Date(cutoffMax).toISOString());
  type RecentRow = {
    account_id: string | null;
    sent_at: string;
    status: string;
  };
  const recentByUser = new Set(
    ((recentRaw ?? []) as RecentRow[])
      .filter((r) => r.account_id && r.status === "sent")
      .map((r) => r.account_id as string)
  );

  // Try to read first-name from patient_profiles for friendlier copy
  const { data: profilesRaw } = await service
    .from("patient_profiles")
    .select("account_id, first_name, is_primary")
    .in("account_id", ids);
  type ProfileRow = {
    account_id: string;
    first_name: string | null;
    is_primary: boolean | null;
  };
  const firstNameByUser = new Map<string, string>();
  for (const p of (profilesRaw ?? []) as ProfileRow[]) {
    // Prefer primary profile's first name; fall back to any
    if (!firstNameByUser.has(p.account_id) || p.is_primary) {
      if (p.first_name) firstNameByUser.set(p.account_id, p.first_name);
    }
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of eligible) {
    if (recentByUser.has(u.id)) {
      skipped += 1;
      continue;
    }

    const daySinceSignup = Math.max(
      1,
      Math.floor((now - u.createdMs) / (24 * 60 * 60 * 1000))
    );

    let confirmationLink: string;
    try {
      confirmationLink = await regenerateConfirmationLink(u.email);
    } catch (err) {
      console.error(
        `[remind-unconfirmed] generateLink failed for ${u.email}:`,
        err
      );
      failed += 1;
      continue;
    }

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_ORDERS!,
        to: u.email,
        subject: confirmReminderSubject(daySinceSignup),
        html: renderConfirmReminderEmail({
          firstName: firstNameByUser.get(u.id) ?? "",
          confirmationLink,
          daySinceSignup,
          portalHost: PORTAL_HOST,
        }),
      });
      sent += 1;

      await service.from("notifications").insert({
        profile_id: null,
        account_id: u.id,
        order_id: null,
        result_id: null,
        channel: "email",
        template: "email_confirm_reminder",
        recipient: u.email,
        status: "sent",
      });
    } catch (err) {
      console.error(
        `[remind-unconfirmed] send failed for ${u.email}:`,
        err
      );
      failed += 1;
      try {
        await service.from("notifications").insert({
          profile_id: null,
          account_id: u.id,
          order_id: null,
          result_id: null,
          channel: "email",
          template: "email_confirm_reminder",
          recipient: u.email,
          status: "failed",
          error_message: String(err),
        });
      } catch {
        /* non-fatal */
      }
    }
  }

  return NextResponse.json({
    ok: true,
    eligible: eligible.length,
    sent,
    skipped,
    failed,
  });
}
