import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  reassembleMetadata,
  materialiseOrder,
  sendOrderConfirmationEmail,
} from "@/lib/checkout/materialise";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook for the multi-person checkout flow.
 *
 * Always returns 200 once the signature is verified — downstream errors
 * are logged but never escalated to Stripe (which would otherwise retry
 * and create duplicate orders).
 *
 * Behaviour:
 *   - Reassembles the chunked CheckoutPayload from session metadata.
 *   - Logged-in flow: creates the order, materialises profiles +
 *     order_lines + visit_group, sends confirmation email.
 *   - Guest flow: stores the order with `account_id = null` and the
 *     payload JSON in `notes`. /api/auth/complete-purchase will create
 *     the account, link the order, and call `materialiseOrder`.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      await handleCheckoutComplete(session);
    } catch (err) {
      console.error("[stripe-webhook] checkout.session.completed failed:", err);
    }
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceRoleClient();

  // Idempotency
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if ((existingOrder as { id: string } | null)?.id) {
    console.log(
      `[stripe-webhook] order already exists for session ${session.id}, skipping`
    );
    return;
  }

  const payload = reassembleMetadata(
    session.metadata as Record<string, string> | null
  );
  if (!payload) {
    throw new Error("Could not reassemble checkout metadata");
  }

  const total =
    (session.amount_total ?? Math.round(payload.total * 100)) / 100;
  const isGuest = !payload.account_user_id;

  // ─── Create the order row ──────────────────────────────────────
  const orderInsert = {
    account_id: payload.account_user_id ?? null,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    stripe_session_id: session.id,
    status: "confirmed" as const,
    subtotal_cad: payload.subtotal,
    home_visit_fee_cad: payload.visit_fees.total,
    tax_cad: 0,
    total_cad: total,
    notes: isGuest ? JSON.stringify({ pending_payload: payload }) : null,
  };

  const { data: orderRaw, error: orderErr } = await supabase
    .from("orders")
    .insert(orderInsert)
    .select("id")
    .single();

  if (orderErr || !orderRaw) {
    throw new Error(`Failed to create order: ${orderErr?.message}`);
  }
  const orderId = (orderRaw as { id: string }).id;

  // Guest path stops here — the success page will collect a password
  // and call /api/auth/complete-purchase to finish the order.
  if (isGuest) {
    console.log(
      `[stripe-webhook] guest order ${orderId} stashed for post-payment account creation`
    );
    return;
  }

  // Logged-in path: materialise + email
  await materialiseOrder(supabase, orderId, payload);
  await sendOrderConfirmationEmail(supabase, orderId, payload);
}
