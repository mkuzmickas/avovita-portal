import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { resend } from "@/lib/resend";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type Stripe from "stripe";

export const runtime = "nodejs";

// Disable body parsing — Stripe requires the raw body for signature verification
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      await handleCheckoutComplete(session, supabase);
    } catch (err) {
      console.error("Error handling checkout.session.completed:", err);
      return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutComplete(
  session: Stripe.Checkout.Session,
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const metadata = session.metadata ?? {};
  const userId = metadata.user_id;

  if (!userId) {
    throw new Error("No user_id in session metadata");
  }

  const cartItemsRaw: Array<{
    test_id: string;
    profile_id: string;
    quantity: number;
    unit_price_cad: number;
  }> = JSON.parse(metadata.cart_items ?? "[]");

  const subtotal = parseFloat(metadata.subtotal ?? "0");
  const visitFeeTotal = parseFloat(metadata.visit_fee_total ?? "0");
  const total = (session.amount_total ?? 0) / 100;

  // Create the order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      account_id: userId,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
      stripe_session_id: session.id,
      status: "confirmed",
      subtotal_cad: subtotal,
      home_visit_fee_cad: visitFeeTotal,
      tax_cad: 0,
      total_cad: total,
    })
    .select()
    .single();

  if (orderError || !order) {
    throw new Error(`Failed to create order: ${orderError?.message}`);
  }

  // Create order lines
  const orderLinesPayload = cartItemsRaw.map((item) => ({
    order_id: order.id,
    test_id: item.test_id,
    profile_id: item.profile_id,
    quantity: item.quantity,
    unit_price_cad: item.unit_price_cad,
  }));

  const { error: linesError } = await supabase
    .from("order_lines")
    .insert(orderLinesPayload);

  if (linesError) {
    throw new Error(`Failed to create order lines: ${linesError.message}`);
  }

  // Create visit groups grouped by profile address
  const profileIds = [...new Set(cartItemsRaw.map((i) => i.profile_id))];
  const { data: profiles } = await supabase
    .from("patient_profiles")
    .select("*")
    .in("id", profileIds);

  if (profiles && profiles.length > 0) {
    const BASE_FEE = Number(process.env.NEXT_PUBLIC_HOME_VISIT_FEE_BASE ?? 85);
    const ADDITIONAL_FEE = Number(process.env.NEXT_PUBLIC_HOME_VISIT_FEE_ADDITIONAL ?? 55);

    // Group by address
    const addressGroups = new Map<
      string,
      { profile: typeof profiles[0]; profileIds: string[] }
    >();

    for (const item of cartItemsRaw) {
      const profile = profiles.find((p) => p.id === item.profile_id);
      if (!profile) continue;

      const key = [profile.address_line1, profile.city, profile.province, profile.postal_code]
        .join("|")
        .toLowerCase();

      if (!addressGroups.has(key)) {
        addressGroups.set(key, { profile, profileIds: [] });
      }
      if (!addressGroups.get(key)!.profileIds.includes(item.profile_id)) {
        addressGroups.get(key)!.profileIds.push(item.profile_id);
      }
    }

    const visitGroupsPayload = Array.from(addressGroups.values()).map(
      ({ profile, profileIds: pids }) => {
        const personCount = pids.length;
        const additionalCount = Math.max(0, personCount - 1);
        const additionalFee = additionalCount * ADDITIONAL_FEE;
        return {
          order_id: order.id,
          address_line1: profile.address_line1,
          address_line2: profile.address_line2,
          city: profile.city,
          province: profile.province,
          postal_code: profile.postal_code,
          base_fee_cad: BASE_FEE,
          additional_person_count: additionalCount,
          additional_fee_cad: additionalFee,
          total_fee_cad: BASE_FEE + additionalFee,
        };
      }
    );

    await supabase.from("visit_groups").insert(visitGroupsPayload);
  }

  // Send order confirmation email
  const { data: account } = await supabase
    .from("accounts")
    .select("email")
    .eq("id", userId)
    .single();

  if (account?.email) {
    const { data: primaryProfile } = await supabase
      .from("patient_profiles")
      .select("first_name")
      .eq("account_id", userId)
      .eq("is_primary", true)
      .maybeSingle();

    const firstName = primaryProfile?.first_name ?? "there";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";

    await resend.emails.send({
      from: process.env.RESEND_FROM_ORDERS!,
      to: account.email,
      subject: `Order Confirmed — AvoVita (#${order.id.slice(0, 8).toUpperCase()})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a1a0d; color: #e8d5a3;">
          <div style="background: #0f2614; padding: 32px; text-align: center; border-bottom: 1px solid #2d6b35;">
            <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-family: Georgia, serif;">AvoVita <span style="color: #c4973a;">Wellness</span></h1>
            <p style="color: #8dc63f; margin: 8px 0 0 0; font-size: 14px;">Private Lab Testing, Calgary</p>
          </div>
          <div style="padding: 32px; background: #0a1a0d;">
            <h2 style="color: #ffffff; font-family: Georgia, serif; margin-top: 0;">Hi ${firstName},</h2>
            <p style="color: #e8d5a3;">Your order has been confirmed. A FloLabs phlebotomist will be in touch to schedule your home collection appointment.</p>
            <p style="color: #e8d5a3;"><strong style="color: #ffffff;">Order ID:</strong> ${order.id.slice(0, 8).toUpperCase()}</p>
            <p style="color: #e8d5a3;"><strong style="color: #ffffff;">Total:</strong> <span style="color: #c4973a; font-weight: 600;">$${total.toFixed(2)} CAD</span></p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${appUrl}/portal/orders" style="background: #c4973a; color: #0a1a0d; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; display: inline-block;">
                View My Order
              </a>
            </div>
            <p style="color: #6ab04c; font-size: 13px;">
              Your results will be delivered securely through this portal once they are available.
              This email was sent by AvoVita Wellness (2490409 Alberta Ltd.), Calgary, AB.
            </p>
          </div>
        </div>
      `,
    });
  }
}
