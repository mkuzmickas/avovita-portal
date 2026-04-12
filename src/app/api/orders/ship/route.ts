import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";
import {
  renderSpecimenShippedEmail,
  SPECIMEN_SHIPPED_SUBJECT,
} from "@/lib/emails/specimenShipped";

export const runtime = "nodejs";

/**
 * POST /api/orders/ship
 *
 * Marks selected orders as shipped with a FedEx tracking number,
 * sends email + SMS notifications to each patient.
 *
 * Body: {
 *   order_ids: string[],
 *   tracking_number: string,
 *   shipping_date: string (YYYY-MM-DD)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!account || account.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const orderIds: string[] = body.order_ids;
    const trackingNumber: string = body.tracking_number?.trim();
    const shippingDate: string = body.shipping_date;

    if (!orderIds?.length || !trackingNumber) {
      return NextResponse.json(
        { error: "order_ids and tracking_number required" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    const nowIso = new Date().toISOString();

    // Update all selected orders
    const { error: updateErr } = await service
      .from("orders")
      .update({
        status: "shipped",
        fedex_tracking_number: trackingNumber,
        shipped_at: nowIso,
        shipping_date: shippingDate || null,
      })
      .in("id", orderIds);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update orders: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // Fetch account + profile info for notifications
    const { data: ordersRaw } = await service
      .from("orders")
      .select(
        `
        id, account_id,
        account:accounts(email),
        order_lines(
          profile:patient_profiles(first_name, phone, is_primary, account_id)
        )
      `
      )
      .in("id", orderIds);

    type OrderRow = {
      id: string;
      account_id: string | null;
      account: { email: string | null } | null;
      order_lines: Array<{
        profile: {
          first_name: string;
          phone: string | null;
          is_primary: boolean;
          account_id: string;
        } | null;
      }>;
    };

    const orders = (ordersRaw ?? []) as unknown as OrderRow[];
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
    const trackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;

    let notifiedCount = 0;

    for (const order of orders) {
      const email = order.account?.email;
      const primaryProfile = order.order_lines
        .map((l) => l.profile)
        .find((p) => p?.is_primary);
      const firstName = primaryProfile?.first_name ?? "there";
      const phone = primaryProfile?.phone;

      // Email
      if (email) {
        try {
          const html = renderSpecimenShippedEmail({
            firstName,
            trackingNumber,
            portalUrl: appUrl,
          });

          await resend.emails.send({
            from: process.env.RESEND_FROM_ORDERS!,
            to: email,
            subject: SPECIMEN_SHIPPED_SUBJECT,
            html,
          });

          await service.from("notifications").insert({
            profile_id: null,
            order_id: order.id,
            result_id: null,
            channel: "email",
            template: "specimen_shipped",
            recipient: email,
            status: "sent",
          });
        } catch (err) {
          console.error(
            `[ship] email failed for order ${order.id}:`,
            err
          );
          await service.from("notifications").insert({
            profile_id: null,
            order_id: order.id,
            result_id: null,
            channel: "email",
            template: "specimen_shipped",
            recipient: email,
            status: "failed",
            error_message: String(err),
          });
        }
      }

      // SMS
      if (phone) {
        try {
          await twilioClient.messages.create({
            from: TWILIO_FROM,
            to: phone,
            body: `AvoVita — Your specimens have shipped. Track via FedEx: ${trackingUrl} — Results will be uploaded to your portal when ready.`,
          });

          await service.from("notifications").insert({
            profile_id: null,
            order_id: order.id,
            result_id: null,
            channel: "sms",
            template: "specimen_shipped",
            recipient: phone,
            status: "sent",
          });
        } catch (err) {
          console.error(
            `[ship] SMS failed for order ${order.id}:`,
            err
          );
          await service.from("notifications").insert({
            profile_id: null,
            order_id: order.id,
            result_id: null,
            channel: "sms",
            template: "specimen_shipped",
            recipient: phone,
            status: "failed",
            error_message: String(err),
          });
        }
      }

      notifiedCount += 1;
    }

    return NextResponse.json({
      success: true,
      shipped: orderIds.length,
      notified: notifiedCount,
    });
  } catch (err) {
    console.error("[ship] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
