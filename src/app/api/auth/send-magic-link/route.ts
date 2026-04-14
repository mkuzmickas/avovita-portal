import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/resend";
import { regenerateConfirmationLink } from "@/lib/auth/createGuestAccount";
import {
  renderConfirmReminderEmail,
  confirmReminderSubject,
} from "@/lib/emails/confirmEmail";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PORTAL_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
  try {
    return new URL(url).host;
  } catch {
    return "portal.avovita.ca";
  }
})();

/**
 * POST /api/auth/send-magic-link
 *
 * Public — takes an email and emails a fresh server-handled confirmation
 * link. Used when:
 *   - A previous link has expired and the user lands on /auth/link-expired
 *   - A user with no password (auto-created at checkout) wants to sign in
 *     via the "Email me a sign-in link" flow on /login
 *
 * Returns success even when the email isn't on file — prevents account
 * enumeration. The actual mail only goes out if there IS a user for that
 * email; that branch is handled silently by regenerateConfirmationLink
 * which throws if the user doesn't exist (caught here, no-op).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email: string | undefined =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    // Account-enumeration guard: only send if a user exists for this email.
    // We swallow any failure and return success either way.
    try {
      const service = createServiceRoleClient();
      const { data: accountRow } = await service
        .from("accounts")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (!accountRow) {
        // No user → silently succeed
        return NextResponse.json({ success: true });
      }

      const { data: profileRow } = await service
        .from("patient_profiles")
        .select("first_name")
        .eq("account_id", (accountRow as { id: string }).id)
        .eq("is_primary", true)
        .maybeSingle();
      const firstName =
        (profileRow as { first_name: string } | null)?.first_name ?? "";

      const link = await regenerateConfirmationLink(email);
      await resend.emails.send({
        from: process.env.RESEND_FROM_ORDERS!,
        to: email,
        subject: confirmReminderSubject(1),
        html: renderConfirmReminderEmail({
          firstName,
          confirmationLink: link,
          daySinceSignup: 1,
          portalHost: PORTAL_HOST,
        }),
      });
    } catch (sendErr) {
      console.error("[send-magic-link] send failed (silent)", sendErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-magic-link]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
