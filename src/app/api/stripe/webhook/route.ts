import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  reassembleMetadata,
  materialiseOrder,
  sendOrderConfirmationEmail,
} from "@/lib/checkout/materialise";
import { createOrFindGuestAccount } from "@/lib/auth/createGuestAccount";
import type { PendingOrderPayload } from "@/lib/checkout/pending-order";
import { fulfillResourcePurchase } from "@/lib/resources/fulfillment";
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
      <tr><td style="padding:8px 0;color:#6ab04c;font-size:13px;border-bottom:1px solid #1a3d22;">Client</td>
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
  const metadata = session.metadata as Record<string, string> | null;

  // ─── VERSION ROUTING ────────────────────────────────────────────
  // v2 uses pending_orders pattern; v1 uses chunk reassembly (legacy).
  if (metadata?.version === "2" && metadata?.pending_order_id) {
    await handleCheckoutCompleteV2(session, metadata.pending_order_id);
    return;
  }

  // CHUNK FALLBACK — remove after 2026-04-30
  // This handles Stripe sessions created before the pending_orders migration.
  // If you're reading this past the removal date, delete this block and
  // the reassembleMetadata function.

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

  const payload = reassembleMetadata(metadata);
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
    // Representative (caregiver) flow: the account is provisioned under
    // the rep's contact info, not whichever patient email Stripe happens
    // to hold. Rep email always wins when present.
    const rep = payload.representative ?? null;
    const guestEmail =
      rep?.email ??
      session.customer_email ??
      session.customer_details?.email;
    if (!guestEmail) {
      throw new Error(
        "Guest checkout has no email on Stripe session or representative payload — cannot provision account"
      );
    }
    try {
      const accountResult = await createOrFindGuestAccount(guestEmail, {
        orgId: payload.org_id ?? null,
        isRepresentative: !!rep,
        phone: rep?.phone ?? null,
      });
      payload.account_user_id = accountResult.accountId;
      confirmationLink = accountResult.confirmationLink;
      console.log(
        `[stripe-webhook] guest account ${accountResult.accountId} ${
          accountResult.created ? "created" : "linked"
        } (alreadyConfirmed=${accountResult.alreadyConfirmed}, org=${payload.org_id ?? "none"})`
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
    org_id: payload.org_id ?? null,
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
  await materialiseOrder(supabase, orderId, payload, total);
  await sendOrderConfirmationEmail(
    supabase,
    orderId,
    payload,
    session.id,
    confirmationLink,
    total
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

// ═══════════════════════════════════════════════════════════════════════
// V2 HANDLER — pending_orders pattern (tests + supplements + resources)
// ═══════════════════════════════════════════════════════════════════════

async function handleCheckoutCompleteV2(
  session: Stripe.Checkout.Session,
  pendingOrderId: string,
) {
  const supabase = createServiceRoleClient();

  // ─── 1. Fetch pending order ─────────────────────────────────────
  const { data: poRaw, error: poErr } = await supabase
    .from("pending_orders")
    .select("id, cart_snapshot, fulfilled_at")
    .eq("id", pendingOrderId)
    .single();

  if (poErr || !poRaw) {
    throw new Error(`Pending order ${pendingOrderId} not found`);
  }
  const po = poRaw as {
    id: string;
    cart_snapshot: PendingOrderPayload;
    fulfilled_at: string | null;
  };
  if (po.fulfilled_at) {
    console.log(
      `[stripe-webhook-v2] pending order ${pendingOrderId} already fulfilled, skipping`,
    );
    return;
  }
  const p = po.cart_snapshot;

  // ─── 2. Idempotency — skip if order already exists ──────────────
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if ((existingOrder as { id: string } | null)?.id) {
    console.log(
      `[stripe-webhook-v2] order already exists for session ${session.id}, skipping`,
    );
    return;
  }

  // ─── 3. Build line-type summary for admin notifications ─────────
  const testCount = (p.test_assignments ?? []).length;
  const suppCount = p.cart_items.filter(
    (i) => i.line_type === "supplement",
  ).length;
  const resCount = p.cart_items.filter(
    (i) => i.line_type === "resource",
  ).length;
  const lineTypeSummary = [
    testCount > 0 ? `${testCount} test${testCount !== 1 ? "s" : ""}` : null,
    suppCount > 0
      ? `${suppCount} supplement${suppCount !== 1 ? "s" : ""}`
      : null,
    resCount > 0
      ? `${resCount} resource${resCount !== 1 ? "s" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const amountCad = ((session.amount_total ?? 0) / 100).toFixed(2);

  // ─── 4. Admin SMS ───────────────────────────────────────────────
  const contactName = p.has_tests
    ? (() => {
        const holder = p.persons?.find((per) => per.is_account_holder);
        return holder
          ? `${holder.first_name} ${holder.last_name}`
          : "Unknown";
      })()
    : `${p.contact_first_name ?? ""} ${p.contact_last_name ?? ""}`.trim() ||
      "Unknown";

  try {
    if (twilioClient) {
      const adminPhones = [process.env.ADMIN_PHONE_NUMBER].filter(
        (ph): ph is string => !!ph && ph.length > 5,
      );
      const smsBody = `AvoVita — New order. ${contactName}. ${lineTypeSummary}. $${amountCad} CAD. portal.avovita.ca/admin/orders`;
      for (const phone of adminPhones) {
        try {
          await twilioClient.messages.create({
            from: TWILIO_FROM,
            to: phone,
            body: smsBody,
          });
          await logNotification(supabase, {
            channel: "sms",
            template: "order_notification_admin",
            recipient: phone,
            status: "sent",
          });
        } catch (err) {
          console.error(
            `[stripe-webhook-v2] SMS to ${phone} failed:`,
            err,
          );
          await logNotification(supabase, {
            channel: "sms",
            template: "order_notification_admin",
            recipient: phone,
            status: "failed",
            error_message: String(err),
          });
        }
      }
    }
  } catch (err) {
    console.error("[stripe-webhook-v2] admin SMS error (non-fatal):", err);
  }

  // ─── 5. Admin email to Jenna ────────────────────────────────────
  const coordinatedFlag =
    p.supplement_fulfillment === "coordinated"
      ? `<tr><td colspan="2" style="padding:12px 0;color:#c4973a;font-size:13px;font-weight:700;border-bottom:1px solid #1a3d22;">⚠ COORDINATED DELIVERY — follow up with client for supplement pickup/delivery</td></tr>`
      : "";

  try {
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
      <tr><td style="padding:8px 0;color:#6ab04c;font-size:13px;border-bottom:1px solid #1a3d22;">Client</td>
          <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1a3d22;">${escapeHtml(contactName)}</td></tr>
      <tr><td style="padding:8px 0;color:#6ab04c;font-size:13px;border-bottom:1px solid #1a3d22;">Items</td>
          <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1a3d22;">${escapeHtml(lineTypeSummary)}</td></tr>
      <tr><td style="padding:8px 0;color:#6ab04c;font-size:13px;border-bottom:1px solid #1a3d22;">Total</td>
          <td style="padding:8px 0;color:#c4973a;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1a3d22;">$${amountCad} CAD</td></tr>
      ${coordinatedFlag}
    </table>
    <div style="text-align:center;">
      <a href="https://portal.avovita.ca/admin/orders" style="display:inline-block;background:#c4973a;color:#0a1a0d;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">View in Admin Panel</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    });
    await logNotification(supabase, {
      channel: "email",
      template: "order_notification_admin",
      recipient: "jenna@avovita.ca",
      status: "sent",
    });
  } catch (err) {
    console.error("[stripe-webhook-v2] admin email failed:", err);
    await logNotification(supabase, {
      channel: "email",
      template: "order_notification_admin",
      recipient: "jenna@avovita.ca",
      status: "failed",
      error_message: String(err),
    });
  }

  // ─── 6. Guest account provisioning ──────────────────────────────
  const total =
    (session.amount_total ?? Math.round(p.total * 100)) / 100;
  const isGuest = !p.account_user_id;
  let confirmationLink: string | null = null;

  if (isGuest) {
    const rep = p.representative ?? null;
    const guestEmail =
      rep?.email ??
      p.contact_email ??
      session.customer_email ??
      session.customer_details?.email;
    if (!guestEmail) {
      throw new Error(
        "Guest checkout has no email — cannot provision account",
      );
    }
    const accountResult = await createOrFindGuestAccount(guestEmail, {
      orgId: p.org_id ?? null,
      isRepresentative: !!rep,
      phone: rep?.phone ?? p.contact_phone ?? null,
    });
    p.account_user_id = accountResult.accountId;
    confirmationLink = accountResult.confirmationLink;
    console.log(
      `[stripe-webhook-v2] guest account ${accountResult.accountId} ${
        accountResult.created ? "created" : "linked"
      }`,
    );
  }

  // ─── 7. Create order row ────────────────────────────────────────
  const orderInsert = {
    account_id: p.account_user_id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    stripe_session_id: session.id,
    status: "confirmed" as const,
    subtotal_cad: p.subtotal_tests + p.subtotal_supplements + p.subtotal_resources,
    discount_cad: p.test_discount,
    home_visit_fee_cad: p.visit_fees?.total ?? 0,
    tax_cad: 0,
    total_cad: total,
    notes: null,
    org_id: p.org_id ?? null,
    // Supplement fields
    has_supplements: p.has_supplements,
    supplement_fulfillment: p.supplement_fulfillment ?? null,
    supplement_shipping_fee_cad: p.supplement_shipping_fee_cad ?? 0,
    supplement_shipping_address: p.supplement_shipping_address ?? null,
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

  // ─── 8. Test lines — delegate to existing materialiseOrder ──────
  if (p.has_tests && p.persons && p.test_assignments && p.collection_address && p.visit_fees) {
    // Build the v1-compatible OrderMetadataPayload for materialiseOrder
    const v1Payload = {
      version: 1 as const,
      account_user_id: p.account_user_id,
      collection_address: p.collection_address,
      persons: p.persons.map((per) => ({
        index: per.index,
        is_account_holder: per.is_account_holder,
        first_name: per.first_name.trim(),
        last_name: per.last_name.trim(),
        date_of_birth: per.date_of_birth,
        biological_sex: per.biological_sex as "male" | "female" | "intersex",
        relationship: per.relationship as string | null,
        phone: per.phone ?? null,
        wants_own_account: per.wants_own_account ?? false,
        own_account_email: per.own_account_email ?? null,
      })),
      assignments: p.test_assignments,
      visit_fees: p.visit_fees,
      subtotal: p.subtotal_tests,
      discount_cad: p.test_discount,
      total: p.total,
      promo_code: p.promo_code ?? null,
      org_id: p.org_id ?? null,
      representative: p.representative ?? null,
    };

    // materialiseOrder creates profiles + test order_lines + visit_group
    await materialiseOrder(supabase, orderId, v1Payload, total);

    // Kit inventory
    try {
      await processKitInventory(supabase, v1Payload);
    } catch (err) {
      console.error(
        "[stripe-webhook-v2] inventory processing failed (non-fatal):",
        err,
      );
    }

    // Patient confirmation email for test orders
    await sendOrderConfirmationEmail(
      supabase,
      orderId,
      v1Payload,
      session.id,
      confirmationLink,
      total,
    );

    // FloLabs requisition email
    if (FLOLABS_NOTIFICATIONS_ENABLED) {
      try {
        const { sendFloLabsRequisition } = await import(
          "@/lib/emails/floLabsRequisition"
        );
        await sendFloLabsRequisition(supabase, orderId, v1Payload);
      } catch (err) {
        console.error(
          `[stripe-webhook-v2] FloLabs requisition email failed for order ${orderId}:`,
          err,
        );
      }
    }
  }

  // ─── 9. Supplement lines — insert order_lines ───────────────────
  if (p.has_supplements) {
    const suppItems = p.cart_items.filter(
      (i) => i.line_type === "supplement",
    );
    const suppLines = suppItems.map((item) => {
      if (item.line_type !== "supplement")
        throw new Error("unreachable");
      return {
        order_id: orderId,
        line_type: "supplement" as const,
        supplement_id: item.supplement_id,
        test_id: null,
        resource_id: null,
        profile_id: null,
        quantity: item.quantity,
        unit_price_cad: item.price_cad,
      };
    });
    const { error: suppErr } = await supabase
      .from("order_lines")
      .insert(suppLines);
    if (suppErr) {
      console.error(
        `[stripe-webhook-v2] Failed to create supplement order_lines: ${suppErr.message}`,
      );
    }

    // Supplement inventory decrement
    try {
      for (const item of suppItems) {
        if (item.line_type !== "supplement") continue;
        const { data: suppRow } = await supabase
          .from("supplements")
          .select("id, name, track_inventory, stock_qty, low_stock_threshold")
          .eq("id", item.supplement_id)
          .single();
        const s = suppRow as {
          id: string;
          name: string;
          track_inventory: boolean;
          stock_qty: number;
          low_stock_threshold: number;
        } | null;
        if (!s?.track_inventory) continue;
        const next = Math.max(0, s.stock_qty - item.quantity);
        await supabase
          .from("supplements")
          .update({ stock_qty: next })
          .eq("id", s.id);
        console.log(
          `[stripe-webhook-v2] supplement stock ${s.name}: ${s.stock_qty} -> ${next}`,
        );
      }
    } catch (err) {
      console.error(
        "[stripe-webhook-v2] supplement inventory error (non-fatal):",
        err,
      );
    }
  }

  // ─── 10. Resource lines — insert order_lines ────────────────────
  if (p.has_resources) {
    const resItems = p.cart_items.filter(
      (i) => i.line_type === "resource",
    );
    const resLines = resItems.map((item) => {
      if (item.line_type !== "resource") throw new Error("unreachable");
      return {
        order_id: orderId,
        line_type: "resource" as const,
        resource_id: item.resource_id,
        test_id: null,
        supplement_id: null,
        profile_id: null,
        quantity: 1,
        unit_price_cad: item.price_cad,
      };
    });
    const { error: resErr } = await supabase
      .from("order_lines")
      .insert(resLines);
    if (resErr) {
      console.error(
        `[stripe-webhook-v2] Failed to create resource order_lines: ${resErr.message}`,
      );
    }

    // Phase R3: Fulfill each paid resource — create purchase row + send
    // download email. Each call is wrapped in try/catch so a failure on
    // one resource doesn't break the others or the overall webhook.
    for (const item of resItems) {
      if (item.line_type !== "resource") continue;
      const buyerEmail =
        p.contact_email ??
        session.customer_email ??
        session.customer_details?.email ??
        "";
      try {
        const result = await fulfillResourcePurchase({
          resourceId: item.resource_id,
          email: buyerEmail,
          orderId,
          accountId: p.account_user_id ?? null,
        });
        console.log(
          `[stripe-webhook-v2] Resource fulfilled: ${item.resource_id} → purchase ${result.purchaseId}`,
        );
      } catch (err) {
        console.error(
          `[stripe-webhook-v2] Failed to fulfill resource ${item.resource_id}:`,
          err,
        );
        // Do not rethrow — other resources should still fulfill, and
        // the order itself should still complete.
      }
    }
  }

  // ─── 11. Send confirmation email for non-test orders ────────────
  // Test orders get their email from materialiseOrder above.
  // Supplement-only and resource-only orders need a simpler email.
  if (!p.has_tests) {
    try {
      const recipientEmail =
        p.contact_email ??
        session.customer_email ??
        session.customer_details?.email;
      if (recipientEmail) {
        const orderIdShort = orderId.slice(0, 8).toUpperCase();
        await resend.emails.send({
          from: process.env.RESEND_FROM_ORDERS!,
          to: recipientEmail,
          subject: `AvoVita — Order Confirmed (#${orderIdShort})`,
          html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a1a0d;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#0f2614;padding:28px 32px;text-align:center;border-bottom:3px solid #c4973a;">
    <h1 style="margin:0;font-size:24px;font-family:Georgia,'Cormorant Garamond',serif;color:#ffffff;">AvoVita <span style="color:#c4973a;">Wellness</span></h1>
    <p style="margin:6px 0 0;font-size:12px;color:#8dc63f;">ORDER CONFIRMED</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="margin:0 0 8px;font-size:22px;font-family:Georgia,serif;color:#ffffff;">Thank you, ${escapeHtml(p.contact_first_name ?? "")}!</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#e8d5a3;">Order #${orderIdShort} · $${amountCad} CAD</p>
    <p style="margin:0 0 8px;font-size:14px;color:#e8d5a3;">${escapeHtml(lineTypeSummary)}</p>
    ${p.has_resources ? '<p style="margin:16px 0 0;font-size:13px;color:#8dc63f;">Your download link(s) will be emailed separately once fulfillment is ready.</p>' : ""}
    ${p.supplement_fulfillment === "coordinated" ? '<p style="margin:16px 0 0;font-size:13px;color:#c4973a;">You selected coordinated delivery — we\'ll be in touch to arrange pickup or delivery.</p>' : ""}
    ${confirmationLink ? `<p style="margin:24px 0 0;"><a href="${confirmationLink}" style="display:inline-block;background:#c4973a;color:#0a1a0d;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">Confirm My Account</a></p><p style="margin:8px 0 0;font-size:11px;color:#6ab04c;">Check your junk folder if the link doesn't arrive.</p>` : ""}
  </td></tr>
  <tr><td style="padding:12px 32px;background:#0f2614;border-top:1px solid #1a3d22;text-align:center;">
    <p style="margin:0;font-size:11px;color:#6ab04c;">AvoVita Wellness Inc. · GST/HST #: 735160749RT0001</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
        });
        await logNotification(supabase, {
          channel: "email",
          template: "order_confirmation_v2",
          recipient: recipientEmail,
          status: "sent",
        });
      }
    } catch (err) {
      console.error(
        "[stripe-webhook-v2] customer confirmation email failed (non-fatal):",
        err,
      );
    }
  }

  // ─── 12. Mark pending order as fulfilled ─────────────────────────
  await supabase
    .from("pending_orders")
    .update({ fulfilled_at: new Date().toISOString() })
    .eq("id", pendingOrderId);

  console.log(
    `[stripe-webhook-v2] order ${orderId} created (${lineTypeSummary})`,
  );
}
