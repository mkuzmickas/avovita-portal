import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/auth/set-initial-password
 *
 * Body: { session_id: string; email: string; password: string }
 *
 * Lets a just-checked-out user set a password WITHOUT an active
 * Supabase session. Same trust model as /api/checkout/sign-waiver:
 *
 *   - The Stripe Checkout `session_id` is the proof the caller owns
 *     a real paid order.
 *   - The supplied `email` must match the email on the account that
 *     owns the order (resolved through orders.account_id → accounts
 *     → auth.users).
 *
 * The password is applied via supabase.auth.admin.updateUserById()
 * using the service-role key — no session or magic-link click needed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId: string | undefined = body.session_id;
    const email: string | undefined = body.email?.toLowerCase().trim();
    const password: string | undefined = body.password;

    if (!sessionId || !email || !password) {
      return NextResponse.json(
        { error: "session_id, email, and password are required" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return NextResponse.json(
        { error: "Invalid checkout session" },
        { status: 400 }
      );
    }
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Session is not paid" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    const { data: orderRaw } = await service
      .from("orders")
      .select("id, account_id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    const order = orderRaw as {
      id: string;
      account_id: string | null;
    } | null;

    if (!order?.account_id) {
      return NextResponse.json(
        { error: "Order is still being created — please try again in a moment" },
        { status: 425 }
      );
    }

    const { data: accountRaw } = await service
      .from("accounts")
      .select("id, email")
      .eq("id", order.account_id)
      .maybeSingle();
    const account = accountRaw as { id: string; email: string | null } | null;
    if (!account?.email || account.email.toLowerCase() !== email) {
      return NextResponse.json(
        { error: "Email does not match this order" },
        { status: 403 }
      );
    }

    const { error: updateErr } = await service.auth.admin.updateUserById(
      account.id,
      { password }
    );
    if (updateErr) {
      console.error("[set-initial-password] admin update failed:", updateErr);
      return NextResponse.json(
        { error: `Failed to set password: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[set-initial-password] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
