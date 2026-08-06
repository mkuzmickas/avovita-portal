import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRepeatClient } from "@/lib/checkout/repeatClientEligibility";

export const runtime = "nodejs";

/**
 * GET /api/account/repeat-client-status
 *
 * Session-scoped eligibility check for the multi-test repeat-client
 * discount. Returns `{ eligible: false }` for guests / unauthenticated
 * sessions and for authenticated accounts with zero prior paid orders.
 * Consumed by the client-side <RepeatClientProvider>.
 *
 * The response is authoritative for UI display only. The Stripe
 * checkout routes re-run the same helper server-side before applying
 * any discount to the coupon amount, so a spoofed client value cannot
 * unlock a discount.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ eligible: false, loggedIn: false });
    }
    const eligible = await isRepeatClient(supabase, user.id);
    return NextResponse.json({ eligible, loggedIn: true });
  } catch (err) {
    console.error("[repeat-client-status] Unexpected error:", err);
    return NextResponse.json({ eligible: false, loggedIn: false });
  }
}
