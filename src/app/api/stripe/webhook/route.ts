import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  reassembleMetadata,
  materialiseOrder,
  sendOrderConfirmationEmail,
} from "@/lib/checkout/materialise";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feature flag for FloLabs requisition emails. Disabled by default —
 * set FLOLABS_NOTIFICATIONS_ENABLED=true in Vercel env vars when
 * ready to go live. Patient confirmation emails and admin SMS
 * notifications fire regardless of this flag.
 */
const FLOLABS_NOTIFICATIONS_ENABLED =
  process.env.FLOLABS_NOTIFICATIONS_ENABLED === "true";

/**
 * Stripe webhook for the multi-person checkout flow.
 *
 * Always returns 200 once the signature is verified — downstream errors
 * are logged but never escalated to Stripe (which would otherwise retry
 * and create duplicate orders).
 *
 * Behaviour:
 *   1. Admin SMS fires IMMEDIATELY on payment confirmation (both guest
 *      and logged-in) using data from the Stripe session itself — no
 *      database order row required.
 *   2. Order row created in Supabase.
 *   3. Logged-in: materialise profiles + order_lines + visit_group,
 *      send patient confirmation email + FloLabs requisition.
 *   4. Guest: stash payload in order.notes — /api/auth/complete-purchase
 *      will finish materialisation + send the confirmation email after
 *      the account is created.
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

// ─── Admin SMS — fires for EVERY paid checkout, guest or logged-in ────

async function sendAdminSms(session: Stripe.Checkout.Session) {
  const adminPhones = [
    process.env.ADMIN_PHONE_NUMBER,
    process.env.ADMIN_PHONE_NUMBER_2,
  ].filter((p): p is string => !!p && p.length > 5);

  if (adminPhones.length === 0) {
    console.log("[stripe-webhook] no ADMIN_PHONE_NUMBER configured, skipping SMS");
    return;
  }

  const lineItemCount = session.metadata?.chunk_count
    ? (() => {
        try {
          const payload = reassembleMetadata(
            session.metadata as Record<string, string>
          );
          return payload?.assignments?.length ?? 0;
        } catch {
          return 0;
        }
      })()
    : 0;

  const customerEmail = session.customer_email ?? "unknown";
  const amountCad = ((session.amount_total ?? 0) / 100).toFixed(2);

  const smsBody = `AvoVita — New order received. ${lineItemCount} test(s). ${customerEmail}. $${amountCad} CAD. portal.avovita.ca/admin/orders`;

  for (const phone of adminPhones) {
    try {
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: phone,
        body: smsBody,
      });
      console.log(`[stripe-webhook] admin SMS sent to ${phone}`);
    } catch (err) {
      console.error(
        `[stripe-webhook] admin SMS to ${phone} failed:`,
        err
      );
    }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceRoleClient();

  // ─── 1. Admin SMS — fires immediately, before any DB work ───────
  // Independent try/catch: SMS failure must never block the order.
  try {
    await sendAdminSms(session);
  } catch (err) {
    console.error("[stripe-webhook] admin SMS error (non-fatal):", err);
  }

  // ─── 2. Idempotency — skip if order already exists ──────────────
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

  // ─── 3. Create the order row ────────────────────────────────────
  const orderInsert = {
    account_id: payload.account_user_id ?? null,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    stripe_session_id: session.id,
    status: "confirmed" as const,
    subtotal_cad: payload.subtotal,
    discount_cad: payload.discount_cad ?? 0,
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

  // Log the admin SMS to notifications table (uses orderId now available)
  try {
    const adminPhone = process.env.ADMIN_PHONE_NUMBER;
    if (adminPhone) {
      await supabase.from("notifications").insert({
        profile_id: null,
        order_id: orderId,
        result_id: null,
        channel: "sms",
        template: "admin_new_order",
        recipient: adminPhone,
        status: "sent",
      });
    }
  } catch {
    // Non-fatal — notification logging failure shouldn't block
  }

  // ─── 4. Guest path stops here ──────────────────────────────────
  // The success page collects a password, /api/auth/complete-purchase
  // creates the account, links the order, materialises profiles, and
  // sends the patient confirmation email.
  if (isGuest) {
    console.log(
      `[stripe-webhook] guest order ${orderId} stashed for post-payment account creation`
    );
    return;
  }

  // ─── 5. Logged-in path: materialise + email + FloLabs ──────────
  await materialiseOrder(supabase, orderId, payload);
  await sendOrderConfirmationEmail(supabase, orderId, payload, session.id);

  // FloLabs requisition email — gated behind feature flag
  if (FLOLABS_NOTIFICATIONS_ENABLED) {
    try {
      const { sendFloLabsRequisition } = await import(
        "@/lib/emails/floLabsRequisition"
      );
      await sendFloLabsRequisition(supabase, orderId, payload);
    } catch (err) {
      console.error(
        `[stripe-webhook] FloLabs requisition email failed for order ${orderId}:`,
        err
      );
    }
  }
}
