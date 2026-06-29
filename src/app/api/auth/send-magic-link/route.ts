import { NextResponse } from "next/server";

/**
 * Magic-link sign-in was removed when passwords became mandatory at
 * checkout. The endpoint is preserved as a 410 stub so any stale
 * caller (cached client bundle, old email link, custom integration)
 * fails loudly with a helpful message instead of silently leaving the
 * user wondering why nothing happens.
 *
 * Customers without a password recover via /forgot-password (Supabase
 * recovery flow). New customers always set a password during the
 * mandatory gate on the checkout success page.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error:
        "Magic-link sign-in has been retired. Use /forgot-password to set a password and sign in with email + password.",
    },
    { status: 410 },
  );
}
