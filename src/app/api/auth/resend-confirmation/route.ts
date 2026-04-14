import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import { regenerateConfirmationLink } from "@/lib/auth/createGuestAccount";
import {
  renderConfirmReminderEmail,
  confirmReminderSubject,
} from "@/lib/emails/confirmEmail";

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
 * POST /api/auth/resend-confirmation
 *
 * On-demand resend of the email-confirmation magic link for the currently
 * signed-in (but unconfirmed) user. Powers the "Resend confirmation email"
 * button on the results gate.
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    if (user.email_confirmed_at) {
      return NextResponse.json({
        success: true,
        already_confirmed: true,
      });
    }
    if (!user.email) {
      return NextResponse.json(
        { error: "Account has no email on file" },
        { status: 400 }
      );
    }

    const link = await regenerateConfirmationLink(user.email);

    await resend.emails.send({
      from: process.env.RESEND_FROM_ORDERS!,
      to: user.email,
      subject: confirmReminderSubject(1),
      html: renderConfirmReminderEmail({
        firstName: "",
        confirmationLink: link,
        daySinceSignup: 1,
        portalHost: PORTAL_HOST,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[resend-confirmation]", err);
    return NextResponse.json(
      { error: "Failed to resend confirmation email" },
      { status: 500 }
    );
  }
}
