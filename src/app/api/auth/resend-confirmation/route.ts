import { NextResponse } from "next/server";

/**
 * Confirmation email reminders were removed when passwords became
 * mandatory at checkout — every new customer's email is marked
 * confirmed by createGuestAccount at provisioning time (Stripe
 * payment is sufficient proof of ownership), so no resend flow is
 * needed. Stubbed as 410 to surface any stale caller cleanly.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error:
        "Email confirmation is no longer required. If you can't sign in, use /forgot-password.",
    },
    { status: 410 },
  );
}
