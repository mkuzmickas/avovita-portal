import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import {
  passwordResetSubject,
  renderPasswordResetEmail,
} from "@/lib/emails/passwordReset";

export const runtime = "nodejs";

/**
 * POST /api/admin/patients/[id]/send-password-reset
 *
 * Admin-only. Generates a Supabase recovery link for the account and
 * emails it via Resend (branded AvoVita template).
 *
 * Why not just call supabase.auth.resetPasswordForEmail from the admin
 * client instead? Two reasons:
 *   1. That method is rate-limited on the anon key — 3-4/hour on the
 *      free tier — and the delivery goes through Supabase's own SMTP
 *      which routinely lands in Gmail spam or drops silently. Pam
 *      Morrell's Sep 17 "no reset email received" report is the
 *      current motivating example.
 *   2. This flow uses the admin API (generateLink) which is not
 *      rate-limited, then sends via Resend (our own from-address
 *      noreply@notifications.avovita.ca that customers already trust)
 *      so deliverability lines up with the order-confirmation email
 *      they've already received.
 *
 * NOT idempotent — admin can fire multiple resets if the customer
 * keeps missing the first email (spam folder, wrong inbox, etc.). Each
 * click generates a fresh 60-minute link.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Admin auth ─────────────────────────────────────────────
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
      { status: 403 },
    );
  }

  const { id: accountId } = await params;
  if (!accountId) {
    return NextResponse.json(
      { error: "Account id is required" },
      { status: 400 },
    );
  }

  // ── Resolve recipient ──────────────────────────────────────
  const service = createServiceRoleClient();
  const { data: accRaw, error: accErr } = await service
    .from("accounts")
    .select(
      `id, email,
       profiles:patient_profiles(first_name, last_name, is_primary)`,
    )
    .eq("id", accountId)
    .maybeSingle();
  if (accErr) {
    return NextResponse.json(
      { error: `Lookup failed: ${accErr.message}` },
      { status: 500 },
    );
  }
  type Acc = {
    id: string;
    email: string | null;
    profiles: Array<{
      first_name: string;
      last_name: string;
      is_primary: boolean;
    }>;
  };
  const acc = accRaw as Acc | null;
  if (!acc) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if (!acc.email) {
    return NextResponse.json(
      { error: "Client has no email on file — set one via the Edit profile button first" },
      { status: 400 },
    );
  }

  const primary =
    acc.profiles.find((p) => p.is_primary) ?? acc.profiles[0] ?? null;
  const firstName = primary?.first_name?.trim() || "there";

  // ── Generate the recovery link via Supabase admin API ──────
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://portal.avovita.ca";
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: "recovery",
    email: acc.email,
    options: {
      redirectTo: `${appUrl}/auth/update-password`,
    },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json(
      {
        error: `Failed to generate recovery link: ${linkErr?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }
  const resetUrl = linkData.properties.action_link;

  // ── Send via Resend ────────────────────────────────────────
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_ORDERS!,
      to: acc.email,
      subject: passwordResetSubject(),
      html: renderPasswordResetEmail({ firstName, resetUrl }),
    });
  } catch (err) {
    console.error("[password-reset] send failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to send password reset email",
      },
      { status: 502 },
    );
  }

  // ── Audit log ──────────────────────────────────────────────
  await service
    .from("analytics_events")
    .insert({
      event_type: "password_reset_sent",
      event_data: {
        client_id: accountId,
        client_email: acc.email,
        admin_user_id: user.id,
      },
      account_id: accountId,
    })
    .then(({ error }) => {
      if (error) {
        console.warn(
          "[password-reset] analytics insert failed:",
          error.message,
        );
      }
    });

  return NextResponse.json({
    sent: true,
    to: acc.email,
  });
}
