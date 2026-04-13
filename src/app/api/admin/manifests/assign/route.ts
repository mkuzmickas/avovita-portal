import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/manifests/assign
 * Admin-only. Sets manifest_id on a list of orders.
 * Pass manifest_id: null to remove orders from any manifest.
 * Body: { order_ids: string[], manifest_id: string | null }
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

    const body = await request.json();
    const orderIds: unknown = body.order_ids;
    const manifestId: unknown = body.manifest_id;

    if (
      !Array.isArray(orderIds) ||
      orderIds.length === 0 ||
      orderIds.some((id) => typeof id !== "string")
    ) {
      return NextResponse.json(
        { error: "order_ids must be a non-empty string array" },
        { status: 400 }
      );
    }
    if (manifestId !== null && typeof manifestId !== "string") {
      return NextResponse.json(
        { error: "manifest_id must be a string or null" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    const { error } = await service
      .from("orders")
      .update({ manifest_id: manifestId })
      .in("id", orderIds);

    if (error) {
      return NextResponse.json(
        { error: `Failed to assign: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, updated: orderIds.length });
  } catch (err) {
    console.error("[manifests:assign]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
