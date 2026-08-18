import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchTrackingStatuses } from "@/lib/fedex/track";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/shipping/refresh-tracking
 *
 * Force-refresh tracking status for a single shipment, bypassing the
 * 10-min staleness throttle used by refreshShipmentTracking on page
 * load. Surfaces FedEx errors verbatim so the shipper can see WHY
 * status isn't loading — the auto-refresh silently swallows errors
 * to keep the page rendering, which hides diagnostic info.
 *
 * Same token/admin-session gate as /create-label and /book-pickup.
 */

const TOKEN_HEADER = "x-shipping-token";

export async function POST(request: NextRequest) {
  const expectedToken = process.env.SHIPPING_ACCESS_TOKEN;
  if (!expectedToken) {
    return NextResponse.json(
      { error: "Server is not configured for shipping." },
      { status: 503 },
    );
  }
  const providedToken =
    request.headers.get(TOKEN_HEADER) ??
    new URL(request.url).searchParams.get("token");
  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  let body: { shipmentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.shipmentId) {
    return NextResponse.json({ error: "shipmentId required." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: row, error: fetchErr } = await supabase
    .from("manual_shipments")
    .select("id, tracking_number, environment")
    .eq("id", body.shipmentId)
    .single();
  if (fetchErr || !row) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }
  const shipment = row as {
    id: string;
    tracking_number: string;
    environment: string;
  };

  if (shipment.environment === "sandbox") {
    return NextResponse.json({
      ok: false,
      note: "Sandbox tracking numbers are not resolvable via the FedEx Tracking API — this row will always show as pending.",
    });
  }

  let statuses;
  try {
    statuses = await fetchTrackingStatuses([shipment.tracking_number]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: message.includes("403") || message.includes("401")
          ? "Likely cause: Tracking API (Basic Integrated Visibility) is not enabled on your FedEx production project. Enable it at developer.fedex.com."
          : undefined,
      },
      { status: 502 },
    );
  }

  const status = statuses[0];
  if (!status) {
    return NextResponse.json({
      ok: false,
      error: "FedEx returned no tracking data for this number.",
    });
  }

  const update: Record<string, unknown> = {
    tracking_status_code: status.statusCode,
    tracking_status_description: status.statusDescription,
    status_fetched_at: new Date().toISOString(),
  };
  if (status.deliveredAt) update.delivered_at = status.deliveredAt;

  const { error: updateErr } = await supabase
    .from("manual_shipments")
    .update(update)
    .eq("id", shipment.id);
  if (updateErr) {
    return NextResponse.json(
      {
        ok: false,
        error: `DB update failed: ${updateErr.message}`,
        hint: updateErr.message.includes("column")
          ? "Likely cause: migration 033_manual_shipments_tracking_status.sql has not been applied to Supabase. Run it in the SQL editor."
          : undefined,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    tracking_number: shipment.tracking_number,
    status_code: status.statusCode,
    status_description: status.statusDescription,
    delivered_at: status.deliveredAt,
  });
}
