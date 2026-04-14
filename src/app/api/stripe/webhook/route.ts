import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  reassembleMetadata,
  materialiseOrder,
  sendOrderConfirmationEmail,
} from "@/lib/checkout/materialise";
import { createOrFindGuestAccount } from "@/lib/auth/createGuestAccount";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";
import { resend } from "@/lib/resend";
import { logNotification } from "@/lib/notifications";
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
  if (!twilioClient) {
    console.error("[stripe-webhook] Twilio client not initialized — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars");
    return;
  }

  const adminPhones = [
    process.env.ADMIN_PHONE_NUMBER,
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

  const amountCad = ((session.amount_total ?? 0) / 100).toFixed(2);

  let patientName = "Unknown";
  try {
    const p = reassembleMetadata(session.metadata as Record<string, string>);
    const holder = p?.persons?.find((per) => per.is_account_holder);
    if (holder) patientName = `${holder.first_name} ${holder.last_name}`;
  } catch { /* ignore */ }

  const smsBody = `AvoVita — New order. ${patientName}. ${lineItemCount} test(s). $${amountCad} CAD. portal.avovita.ca/admin/orders`;

  const service = createServiceRoleClient();
  for (const phone of adminPhones) {
    try {
      console.log(`[stripe-webhook] attempting SMS to ${phone}`);
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: phone,
        body: smsBody,
      });
      console.log(`[stripe-webhook] SMS success to ${phone}`);
      await logNotification(service, {
        channel: "sms",
        template: "order_notification_admin",
        recipient: phone,
        status: "sent",
      });
    } catch (err) {
      console.error(
        `[stripe-webhook] SMS to ${phone} failed:`,
        JSON.stringify(err)
      );
      await logNotification(service, {
        channel: "sms",
        template: "order_notification_admin",
        recipient: phone,
        status: "failed",
        error_message: String(err),
      });
    }
  }
}

// ─── Admin email to Jenna — fires for EVERY paid checkout ────────────

async function sendAdminNotificationEmail(session: Stripe.Checkout.Session) {
  let patientName = "Unknown";
  let lineItemCount = 0;
  try {
    const p = reassembleMetadata(
      session.metadata as Record<string, string>
    );
    const holder = p?.persons?.find((per) => per.is_account_holder);
    if (holder) patientName = `${holder.first_name} ${holder.last_name}`;
    lineItemCount = p?.assignments?.length ?? 0;
  } catch { /* ignore */ }

  const amountCad = ((session.amount_total ?? 0) / 100).toFixed(2);

  try {
    console.log("[stripe-webhook] sending admin notification email to jenna@avovita.ca");
    await resend.emails.send({
      from: process.env.RESEND_FROM_ORDERS!,
      to: "jenna@avovita.ca",
      subject: "AvoVita — New Order Received",
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a1a0d;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#0f2614;padding:28px 32px;text-align:center;border-bottom:3px solid #c4973a;">
    <h1 style="margin:0;font-size:24px;font-family:Georgia,'Cormorant Garamond',serif;color:#ffffff;">AvoVita <span style="color:#c4973a;">Wellness</span></h1>
    <p style="margin:6px 0 0;font-size:12px;color:#8dc63f;">NEW ORDER NOTIFICATION</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="margin:0 0 16px;font-size:22px;font-family:Georgia,serif;color:#ffffff;">New Order Received</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#6ab04c;font-size:13px;border-bottom:1px solid #1a3d22;">Patient</td>
          <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1a3d22;">${escapeHtml(patientName)}</td></tr>
      <tr><td style="padding:8px 0;color:#6ab04c;font-size:13px;border-bottom:1px solid #1a3d22;">Tests</td>
          <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1a3d22;">${lineItemCount}</td></tr>
      <tr><td style="padding:8px 0;color:#6ab04c;font-size:13px;border-bottom:1px solid #1a3d22;">Total</td>
          <td style="padding:8px 0;color:#c4973a;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1a3d22;">$${amountCad} CAD</td></tr>
    </table>
    <div style="text-align:center;">
      <a href="https://portal.avovita.ca/admin/orders" style="display:inline-block;background:#c4973a;color:#0a1a0d;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">View in Admin Panel</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    });
    console.log("[stripe-webhook] admin email sent to jenna@avovita.ca");
    await logNotification(createServiceRoleClient(), {
      channel: "email",
      template: "order_notification_admin",
      recipient: "jenna@avovita.ca",
      status: "sent",
    });
  } catch (err) {
    console.error(
      "[stripe-webhook] admin email to jenna@avovita.ca failed:",
      JSON.stringify(err)
    );
    await logNotification(createServiceRoleClient(), {
      channel: "email",
      template: "order_notification_admin",
      recipient: "jenna@avovita.ca",
      status: "failed",
      error_message: String(err),
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Kit inventory — decrement + low-stock alerts ────────────────────

const LOW_STOCK_THRESHOLD = 2;

async function processKitInventory(
  supabase: ReturnType<typeof createServiceRoleClient>,
  payload: NonNullable<ReturnType<typeof reassembleMetadata>>
) {
  // Count purchased quantity per test
  const qtyByTest = new Map<string, number>();
  for (const a of payload.assignments) {
    qtyByTest.set(a.test_id, (qtyByTest.get(a.test_id) ?? 0) + 1);
  }

  const testIds = [...qtyByTest.keys()];
  if (testIds.length === 0) return;

  const { data: testsRaw } = await supabase
    .from("tests")
    .select("id, name, track_inventory, stock_qty, low_stock_threshold")
    .in("id", testIds);

  type TestRow = {
    id: string;
    name: string;
    track_inventory: boolean | null;
    stock_qty: number | null;
    low_stock_threshold: number | null;
  };
  const tests = (testsRaw ?? []) as unknown as TestRow[];

  for (const test of tests) {
    if (!test.track_inventory) continue;
    const purchased = qtyByTest.get(test.id) ?? 0;
    if (purchased === 0) continue;

    const current = test.stock_qty ?? 0;
    const next = Math.max(0, current - purchased);

    const { error: updErr } = await supabase
      .from("tests")
      .update({ stock_qty: next })
      .eq("id", test.id);

    if (updErr) {
      console.error(
        `[stripe-webhook] failed to decrement stock for ${test.name}:`,
        updErr.message
      );
      continue;
    }

    console.log(
      `[stripe-webhook] stock for ${test.name}: ${current} -> ${next}`
    );

    const threshold = test.low_stock_threshold ?? LOW_STOCK_THRESHOLD;
    if (next <= threshold) {
      await sendLowStockAlerts(test.name, next, threshold);
    }
  }
}

async function sendLowStockAlerts(
  testName: string,
  stockQty: number,
  threshold: number
) {
  // SMS to admin
  try {
    const adminPhone = process.env.ADMIN_PHONE_NUMBER;
    if (twilioClient && adminPhone) {
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: adminPhone,
        body: `AvoVita — Low kit stock: ${testName} has ${stockQty} remaining. Time to reorder.`,
      });
      console.log(`[stripe-webhook] low-stock SMS sent for ${testName}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] low-stock SMS failed for ${testName}:`, err);
  }

  // Email to Jenna
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_ORDERS!,
      to: "jenna@avovita.ca",
      subject: `Low Kit Stock Alert — ${testName}`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#0f2614;padding:28px 32px;text-align:center;border-bottom:3px solid #c4973a;">
    <h1 style="margin:0;font-size:24px;font-family:Georgia,'Cormorant Garamond',serif;color:#ffffff;">AvoVita <span style="color:#c4973a;">Wellness</span></h1>
    <p style="margin:6px 0 0;font-size:12px;color:#c4973a;">LOW KIT STOCK ALERT</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="margin:0 0 16px;font-size:20px;font-family:Georgia,serif;color:#111827;">Time to reorder</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Test</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">${escapeHtml(testName)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Stock remaining</td>
          <td style="padding:8px 0;color:#c4973a;font-size:14px;font-weight:700;text-align:right;border-bottom:1px solid #e5e7eb;">${stockQty}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Threshold</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;text-align:right;border-bottom:1px solid #e5e7eb;">${threshold}</td></tr>
    </table>
    <div style="text-align:center;">
      <a href="https://portal.avovita.ca/admin/tests" style="display:inline-block;background:#c4973a;color:#0a1a0d;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">Manage Tests</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    });
    console.log(`[stripe-webhook] low-stock email sent for ${testName}`);
  } catch (err) {
    console.error(`[stripe-webhook] low-stock email failed for ${testName}:`, err);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceRoleClient();

  // ─── 1. Admin notifications — fire immediately, before any DB work ──
  try {
    await sendAdminSms(session);
  } catch (err) {
    console.error("[stripe-webhook] admin SMS error (non-fatal):", err);
  }
  try {
    await sendAdminNotificationEmail(session);
  } catch (err) {
    console.error("[stripe-webhook] admin email error (non-fatal):", err);
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

  // ─── 2b. Guest path — auto-create the Supabase account ────────
  // The new model creates the account immediately at checkout instead
  // of asking the customer to set a password on the success page. The
  // confirmation link from createOrFindGuestAccount is embedded in the
  // order email so the customer can activate with one click.
  let confirmationLink: string | null = null;
  if (isGuest) {
    const guestEmail =
      session.customer_email ?? session.customer_details?.email;
    if (!guestEmail) {
      throw new Error(
        "Guest checkout has no customer_email on Stripe session — cannot provision account"
      );
    }
    try {
      const accountResult = await createOrFindGuestAccount(guestEmail);
      payload.account_user_id = accountResult.accountId;
      confirmationLink = accountResult.confirmationLink;
      console.log(
        `[stripe-webhook] guest account ${accountResult.accountId} ${
          accountResult.created ? "created" : "linked"
        } (alreadyConfirmed=${accountResult.alreadyConfirmed})`
      );
    } catch (err) {
      console.error(
        "[stripe-webhook] guest account provisioning failed:",
        err
      );
      throw err;
    }
  }

  // ─── 3. Create the order row ────────────────────────────────────
  const orderInsert = {
    account_id: payload.account_user_id,
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
    notes: null,
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

  // (Admin SMS + email to Jenna were already logged to notifications
  // inside sendAdminSms / sendAdminNotificationEmail above, with their
  // real sent/failed status.)

  // ─── 3b. Kit inventory — decrement stock, alert if low ────────
  // Wrapped so stock errors never block order completion.
  try {
    await processKitInventory(supabase, payload);
  } catch (err) {
    console.error("[stripe-webhook] inventory processing failed (non-fatal):", err);
  }

  // ─── 4. Materialise + send confirmation email ──────────────────
  // Single path now — guests went through createOrFindGuestAccount above
  // so payload.account_user_id is always set by this point.
  await materialiseOrder(supabase, orderId, payload);
  await sendOrderConfirmationEmail(
    supabase,
    orderId,
    payload,
    session.id,
    confirmationLink
  );

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
