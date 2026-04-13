import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/orders/[id]/appointment
 * Admin-only. Sets the appointment_date on an order.
 * If the order's current status is "confirmed" and a non-null date is being
 * set, also bumps status to "scheduled".
 * Body: { appointment_date: string (YYYY-MM-DD) | null }
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
    const body = await request.json();
    const date: unknown = body.appointment_date;

    if (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      return NextResponse.json(
        { error: "appointment_date must be YYYY-MM-DD or null" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    // Fetch current status to decide whether to auto-bump
    const { data: orderRow } = await service
      .from("orders")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const order = orderRow as { status: string } | null;
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = { appointment_date: date };
    let newStatus: string | null = null;
    if (date && order.status === "confirmed") {
      update.status = "scheduled";
      newStatus = "scheduled";
    }

    const { error } = await service
      .from("orders")
      .update(update)
      .eq("id", id);

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
