import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FLO_LABS_URL =
  "https://flolabsbooking.as.me/?appointmentType=84416067";

/**
 * GET /api/cron/waiver-reminder
 *
 * Vercel Cron job that runs daily at 10am UTC. Finds accounts that:
 *   - have waiver_completed = false
 *   - were created between 24 and 72 hours ago
 *   - are patients (not admins)
 *
 * Sends a friendly reminder email via Resend and logs to notifications.
 */
export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const now = new Date();
  const twentyFourHoursAgo = new Date(
    now.getTime() - 24 * 60 * 60 * 1000
  ).toISOString();
  const seventyTwoHoursAgo = new Date(
    now.getTime() - 72 * 60 * 60 * 1000
  ).toISOString();

  const { data: accountsRaw, error: queryErr } = await supabase
    .from("accounts")
    .select(
      `
      id, email, created_at,
      profiles:patient_profiles(first_name, is_primary)
    `
    )
    .eq("role", "patient")
    .eq("waiver_completed", false)
    .lt("created_at", twentyFourHoursAgo)
    .gt("created_at", seventyTwoHoursAgo);

  if (queryErr) {
    console.error("[waiver-reminder] query error:", queryErr);
    return NextResponse.json(
      { error: queryErr.message, sent: 0 },
      { status: 500 }
    );
  }

  type AccountRow = {
    id: string;
    email: string | null;
    created_at: string;
    profiles: Array<{ first_name: string; is_primary: boolean }>;
  };
  const accounts = (accountsRaw ?? []) as unknown as AccountRow[];

  let sentCount = 0;
  const portalUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";

  for (const account of accounts) {
    if (!account.email) continue;

    const primaryProfile = account.profiles.find((p) => p.is_primary);
    const firstName = primaryProfile?.first_name ?? "there";

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_ORDERS!,
        to: account.email,
        subject:
          "Don\u2019t forget \u2014 complete your AvoVita waiver and book your collection",
        html: renderReminderEmail(firstName, portalUrl),
      });

      await supabase.from("notifications").insert({
        profile_id: null,
        order_id: null,
        result_id: null,
        channel: "email",
        template: "waiver_reminder",
        recipient: account.email,
        status: "sent",
      });

      sentCount += 1;
    } catch (err) {
      console.error(
        `[waiver-reminder] failed to send to ${account.email}:`,
        err
      );
      await supabase.from("notifications").insert({
        profile_id: null,
        order_id: null,
        result_id: null,
        channel: "email",
        template: "waiver_reminder",
        recipient: account.email,
        status: "failed",
        error_message: String(err),
      });
    }
  }

  console.log(
    `[waiver-reminder] checked ${accounts.length} accounts, sent ${sentCount} reminders`
  );

  return NextResponse.json({
    checked: accounts.length,
    sent: sentCount,
  });
}

function renderReminderEmail(firstName: string, portalUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f2614;padding:32px;text-align:center;border-bottom:3px solid #c4973a;">
    <h1 style="margin:0;font-size:28px;font-family:Georgia,serif;color:#ffffff;">AvoVita <span style="color:#c4973a;">Wellness</span></h1>
    <p style="margin:8px 0 0;font-size:13px;color:#8dc63f;">PRIVATE LAB TESTING \u00b7 CALGARY</p>
  </td></tr>
  <tr><td style="padding:36px 32px 16px;">
    <h2 style="margin:0 0 12px;font-size:24px;font-family:Georgia,serif;color:#111827;">Hi ${escapeHtml(firstName)},</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.5;">
      Just a friendly reminder \u2014 your AvoVita waiver still needs to be completed before your collection appointment can proceed.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.5;">
      It only takes a minute, and you\u2019ll also want to book your FloLabs appointment if you haven\u2019t already.
    </p>
  </td></tr>
  <tr><td style="padding:0 32px 16px;text-align:center;">
    <a href="${portalUrl}/portal" style="display:inline-block;background:#c4973a;color:#0a1a0d;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;margin-bottom:12px;">Complete my waiver</a>
  </td></tr>
  <tr><td style="padding:0 32px 32px;text-align:center;">
    <a href="${FLO_LABS_URL}" style="display:inline-block;background:#0f2614;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;">Book FloLabs appointment</a>
  </td></tr>
  <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">AvoVita Wellness \u00b7 2490409 Alberta Ltd. \u00b7 Calgary, AB</p>
    <p style="margin:0;font-size:11px;color:#9ca3af;">Your health information is protected under Alberta PIPA.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
