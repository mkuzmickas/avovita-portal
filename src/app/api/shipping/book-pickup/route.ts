import { NextRequest, NextResponse } from "next/server";
import { bookPickup } from "@/lib/fedex/pickup";
import { SAVED_PICKUP_ADDRESSES, PICKUP_DEFAULTS } from "@/lib/config/pickup";
import { resend } from "@/lib/resend";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/shipping/book-pickup
 *
 * Books a FedEx courier pickup for a given date + address. Uses the
 * same token gate as /api/shipping/create-label so the same FloLabs
 * bookmark URL grants pickup access too.
 *
 * Rate limit is separate from the label endpoint (some days FloLabs
 * ships nothing but needs to reschedule pickup, or vice versa).
 */

const TOKEN_HEADER = "x-shipping-token";
const DAILY_PICKUP_CAP = 6;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

let pickupTimestamps: number[] = [];

function checkRateLimit(): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - DAILY_WINDOW_MS;
  pickupTimestamps = pickupTimestamps.filter((t) => t > cutoff);
  if (pickupTimestamps.length >= DAILY_PICKUP_CAP) {
    const oldest = pickupTimestamps[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + DAILY_WINDOW_MS - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  pickupTimestamps.push(now);
  return { ok: true, retryAfterSec: 0 };
}

export async function POST(request: NextRequest) {
  // ─── Auth ─────────────────────────────────────────────────────
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

  const rl = checkRateLimit();
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Daily pickup limit reached (${DAILY_PICKUP_CAP}/day). Try again later.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  // ─── Parse body ───────────────────────────────────────────────
  let body: {
    addressKey?: string;
    date?: string;
    readyTime?: string;
    closeTime?: string;
    packageCount?: number;
    totalWeightLb?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const address = SAVED_PICKUP_ADDRESSES.find(
    (a) => a.key === (body.addressKey ?? "shawfield"),
  );
  if (!address) {
    return NextResponse.json(
      { error: `Unknown pickup address: ${body.addressKey}` },
      { status: 400 },
    );
  }
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json(
      { error: "Missing or invalid date (expected YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const readyTime = body.readyTime ?? PICKUP_DEFAULTS.readyTime;
  const closeTime = body.closeTime ?? PICKUP_DEFAULTS.closeTime;
  const packageCount = body.packageCount ?? PICKUP_DEFAULTS.packageCount;
  const totalWeightLb = body.totalWeightLb ?? PICKUP_DEFAULTS.totalWeightLb;

  // ─── Book with FedEx ──────────────────────────────────────────
  let pickup;
  try {
    pickup = await bookPickup({
      address,
      date: body.date,
      readyTime,
      closeTime,
      packageCount,
      totalWeightLb,
      packageLocation: PICKUP_DEFAULTS.packageLocation,
      carrierCode: PICKUP_DEFAULTS.carrierCode,
      commodityDescription: PICKUP_DEFAULTS.commodityDescription,
      notificationEmail: PICKUP_DEFAULTS.notificationEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[shipping/book-pickup] FedEx Pickup API failed:", message);
    return NextResponse.json(
      { error: `FedEx pickup failed: ${message}` },
      { status: 502 },
    );
  }

  const environment = process.env.FEDEX_API_URL?.includes("sandbox")
    ? "sandbox"
    : "production";

  // ─── Notify Mike ──────────────────────────────────────────────
  try {
    await resend.emails.send({
      from: "AvoVita Shipping <noreply@notify.avovita.ca>",
      to: "mike@avovita.ca",
      subject: `[Pickup booked] ${body.date} · ${pickup.confirmationCode}`,
      html: `
        <p>FedEx pickup scheduled via <code>/shipping</code>.</p>
        <p>
          Confirmation: <strong>${pickup.confirmationCode}</strong><br>
          Date: <strong>${body.date}</strong><br>
          Window: <strong>${readyTime} – ${closeTime}</strong> (Calgary local)<br>
          Address: ${address.streetLines.join(", ")}, ${address.city} ${address.stateOrProvince} ${address.postalCode}<br>
          Packages: ${packageCount} · ${totalWeightLb} lb total<br>
          Environment: ${environment}
        </p>
      `,
    });
  } catch (err) {
    console.warn("[shipping/book-pickup] Notification email failed:", err);
  }

  return NextResponse.json({
    ok: true,
    confirmation_code: pickup.confirmationCode,
    scheduled_date: pickup.scheduledDate,
    location: pickup.location,
    ready_time: readyTime,
    close_time: closeTime,
    address_label: address.displayLabel,
    environment,
  });
}
