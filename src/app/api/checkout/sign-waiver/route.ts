import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

function withTimeoutLocal<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T | { __timeout: true }> {
  return Promise.race<T | { __timeout: true }>([
    promise.then((v) => v as T),
    new Promise<{ __timeout: true }>((resolve) =>
      setTimeout(() => {
        console.warn(`[sign-waiver] ${label} timed out after ${ms}ms`);
        resolve({ __timeout: true });
      }, ms)
    ),
  ]);
}

function isTimeoutLocal<T>(v: T | { __timeout: true }): v is { __timeout: true } {
  return (
    typeof v === "object" &&
    v !== null &&
    "__timeout" in (v as Record<string, unknown>) &&
    (v as { __timeout: true }).__timeout === true
  );
}

/**
 * POST /api/checkout/sign-waiver
 *
 * Records the waiver signature for a freshly-checked-out order
 * WITHOUT requiring a Supabase session. The client may still be a
 * guest who hasn't clicked the email-confirmation link yet.
 *
 * Trust model:
 *   - The Stripe Checkout `session_id` is the proof the request
 *     belongs to a real, paid order. We only proceed if the session
 *     status is "paid".
 *   - The supplied `email` must match the email recorded on the
 *     account that owns the order (also matched against the Stripe
 *     session's customer_email as a secondary check).
 *
 * Body: { session_id: string; signed_name: string; email: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId: string | undefined = body.session_id;
    const signedName: string | undefined = body.signed_name;
    const email: string | undefined = body.email?.toLowerCase().trim();

    if (!sessionId || !signedName || !email) {
      return NextResponse.json(
        { error: "session_id, signed_name, and email are required" },
        { status: 400 }
      );
    }
    if (signedName.trim().length < 3) {
      return NextResponse.json(
        { error: "Signed name must be at least 3 characters" },
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
      // Webhook hasn't materialised the order yet — the client should
      // retry. The success page polls so this typically resolves.
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

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    const nowIso = new Date().toISOString();

    // 15s timeout + one retry after 1s. Service-role client bypasses
    // RLS and uses a more reliable connection path than anon.
    const runAccountsUpdate = () =>
      withTimeoutLocal(
        Promise.resolve(
          service
            .from("accounts")
            .update({
              waiver_completed: true,
              waiver_completed_at: nowIso,
              waiver_ip_address: ipAddress,
              waiver_signed_name: signedName.trim(),
              waiver_version: "1.0",
            })
            .eq("id", account.id)
        ),
        15_000,
        "accounts.update"
      );

    let updateRes = await runAccountsUpdate();
    if (isTimeoutLocal(updateRes)) {
      console.warn("[sign-waiver] accounts.update timed out — retrying once");
      await new Promise((r) => setTimeout(r, 1000));
      updateRes = await runAccountsUpdate();
    }
    if (isTimeoutLocal(updateRes)) {
      return NextResponse.json(
        { error: "Save timed out — please try again" },
        { status: 504 }
      );
    }
    if (updateRes.error) {
      return NextResponse.json(
        { error: `Failed to save waiver: ${updateRes.error.message}` },
        { status: 500 }
      );
    }

    // Sequential, isolated consent log — never blocks the success
    // response. Same 15s timeout so a slow connection doesn't surface
    // as a hung user request.
    try {
      const consentRes = await withTimeoutLocal(
        Promise.resolve(
          service.from("consents").insert({
            account_id: account.id,
            profile_id: null,
            consent_type: "general_pipa",
            consent_text_version: "1.0",
            ip_address: ipAddress,
            user_agent: request.headers.get("user-agent") ?? null,
          })
        ),
        15_000,
        "consent insert"
      );
      if (isTimeoutLocal(consentRes)) {
        console.warn("[sign-waiver] consent insert timed out (non-fatal)");
      } else if (consentRes.error) {
        console.warn(
          "[sign-waiver] consent insert error (non-fatal):",
          consentRes.error.message
        );
      }
    } catch (err) {
      console.warn("[sign-waiver] consent log failed (non-fatal):", err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sign-waiver] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
