import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { PendingOrderPayload } from "@/lib/checkout/pending-order";

/**
 * POST /api/checkout/create-pending-order
 *
 * Creates a pending_orders row with the full cart snapshot. Returns
 * the pending_order_id for the client to pass to the Stripe
 * checkout-unified route.
 *
 * No auth required — guest checkouts need this too.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as PendingOrderPayload;

    if (!payload || !payload.cart_items || payload.cart_items.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty" },
        { status: 400 },
      );
    }

    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("pending_orders")
      .insert({ cart_snapshot: payload })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: `Failed to create pending order: ${error?.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      pending_order_id: (data as { id: string }).id,
    });
  } catch (err) {
    console.error("[create-pending-order] error:", err);
    return NextResponse.json(
      { error: "Failed to create pending order" },
      { status: 500 },
    );
  }
}
