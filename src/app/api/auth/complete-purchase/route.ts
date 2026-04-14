import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * DEPRECATED — kept as a no-op stub.
 *
 * Pre-November 2026 this route accepted a Stripe session id, email and
 * password, then created the Supabase user, materialised profiles, and
 * sent the confirmation email. Under the new auto-account-at-checkout
 * model the Stripe webhook does all of that synchronously, and the
 * /checkout/success page no longer collects a password.
 *
 * Stale clients (e.g. a tab opened before the deploy) may still hit this
 * route. Returning a benign success keeps them from showing an error
 * banner — there is genuinely nothing left for them to do, so this is the
 * right outcome.
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    deprecated: true,
    message:
      "Account is created automatically at checkout. Check your email to activate it.",
  });
}
