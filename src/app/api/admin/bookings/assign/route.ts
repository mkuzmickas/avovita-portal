import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/bookings/assign
 *
 * Body: { orderId: string, appointmentAtISO: string, address?: string,
 *         durationMinutes?: number }
 *
 * Sets orders.appointment_at (and .appointment_end_at if duration given).
 * Admin-only. Overrides any prior value silently so re-assignment works
 * for rescheduled Acuity emails.
 */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 as const };
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") return { ok: false, status: 403 as const };
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Admin only." }, { status: auth.status });
  }

  let body: {
    orderId?: string;
    appointmentAtISO?: string;
    durationMinutes?: number;
    /** If set, the paired booking_events row is marked
     *  resolution='manually_assigned' pointing at the same order. */
    bookingEventId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (!body.orderId || !body.appointmentAtISO) {
    return NextResponse.json(
      { error: "orderId and appointmentAtISO required." },
      { status: 400 },
    );
  }

  const start = new Date(body.appointmentAtISO);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json(
      { error: "appointmentAtISO is not a valid timestamp." },
      { status: 400 },
    );
  }
  const durationMinutes = body.durationMinutes ?? 30;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const service = createServiceRoleClient();
  const { error } = await service
    .from("orders")
    .update({
      appointment_at: start.toISOString(),
      appointment_end_at: end.toISOString(),
      // Keep the legacy date column in sync for anything still reading it.
      appointment_date: start.toISOString().slice(0, 10),
    })
    .eq("id", body.orderId);

  if (error) {
    return NextResponse.json(
      { error: `Assign failed: ${error.message}` },
      { status: 500 },
    );
  }

  // If this came from the review queue, mark the underlying event as
  // resolved so it drops off Jenna's list.
  if (body.bookingEventId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await service
      .from("booking_events")
      .update({
        resolution: "manually_assigned",
        matched_order_id: body.orderId,
        resolved_by: user?.id ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", body.bookingEventId);
  }

  return NextResponse.json({
    ok: true,
    order_id: body.orderId,
    appointment_at: start.toISOString(),
    appointment_end_at: end.toISOString(),
  });
}
