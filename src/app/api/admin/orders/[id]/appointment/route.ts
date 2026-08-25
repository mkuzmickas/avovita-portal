import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/orders/[id]/appointment
 *
 * Admin-only. Stamps a collection appointment on an order — used both
 * by the shipping console (date-only) and by the calendar's "Add
 * appointment" flow (full timestamp + optional end time).
 *
 * Body — either shape:
 *   { appointment_date: "YYYY-MM-DD" | null }
 *   { appointment_at: "ISO-with-tz", appointment_end_at?: "ISO-with-tz" | null }
 *
 * When appointment_at is given, appointment_date is derived (the date
 * portion in Calgary local) and appointment_end_at defaults to +30
 * minutes. Passing both is fine — appointment_at wins.
 *
 * Any non-null date auto-bumps a "confirmed" order to "scheduled".
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: accountRow } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();
    const account = accountRow as { role: string } | null;
    if (!account || account.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rawDate: unknown = (body as Record<string, unknown>).appointment_date;
    const rawAt: unknown = (body as Record<string, unknown>).appointment_at;
    const rawEndAt: unknown = (body as Record<string, unknown>).appointment_end_at;

    // Datetime path — used by the calendar Add-appointment modal.
    let atISO: string | null = null;
    let endAtISO: string | null = null;
    let dateISO: string | null = null;

    if (rawAt !== undefined && rawAt !== null) {
      if (typeof rawAt !== "string") {
        return NextResponse.json(
          { error: "appointment_at must be an ISO datetime string" },
          { status: 400 },
        );
      }
      const at = new Date(rawAt);
      if (isNaN(at.getTime())) {
        return NextResponse.json(
          { error: "appointment_at is not a valid datetime" },
          { status: 400 },
        );
      }
      atISO = at.toISOString();
      dateISO = calgaryLocalDate(at);
      if (rawEndAt !== undefined && rawEndAt !== null) {
        if (typeof rawEndAt !== "string") {
          return NextResponse.json(
            { error: "appointment_end_at must be an ISO datetime string" },
            { status: 400 },
          );
        }
        const endAt = new Date(rawEndAt);
        if (isNaN(endAt.getTime())) {
          return NextResponse.json(
            { error: "appointment_end_at is not a valid datetime" },
            { status: 400 },
          );
        }
        endAtISO = endAt.toISOString();
      } else {
        // Default 30-min collection window.
        endAtISO = new Date(at.getTime() + 30 * 60 * 1000).toISOString();
      }
    } else if (rawDate !== undefined) {
      // Date-only path — legacy shipping-console flow.
      if (
        rawDate !== null &&
        (typeof rawDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate))
      ) {
        return NextResponse.json(
          { error: "appointment_date must be YYYY-MM-DD or null" },
          { status: 400 },
        );
      }
      dateISO = rawDate as string | null;
    } else {
      return NextResponse.json(
        { error: "Provide appointment_at or appointment_date" },
        { status: 400 },
      );
    }

    const service = createServiceRoleClient();

    const { data: orderRow } = await service
      .from("orders")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const order = orderRow as { status: string } | null;
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = { appointment_date: dateISO };
    if (atISO !== null) update.appointment_at = atISO;
    if (endAtISO !== null) update.appointment_end_at = endAtISO;
    // Explicit-null case for the legacy path: clear the datetime too.
    if (rawAt === null) {
      update.appointment_at = null;
      update.appointment_end_at = null;
    }

    let newStatus: string | null = null;
    const hasScheduling = dateISO || atISO;
    if (hasScheduling && order.status === "confirmed") {
      update.status = "scheduled";
      newStatus = "scheduled";
    }

    const { error } = await service.from("orders").update(update).eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to update appointment: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("[orders:appointment]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Calgary-local YYYY-MM-DD for the given instant. */
function calgaryLocalDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}
