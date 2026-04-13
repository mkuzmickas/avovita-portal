import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/tests/stock
 * Admin-only. Sets stock_qty for a tracked test.
 * Body: { test_id: string, stock_qty: number }
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
    const testId: string | undefined = body.test_id;
    const stockQty: unknown = body.stock_qty;

    if (!testId || typeof stockQty !== "number" || !Number.isFinite(stockQty)) {
      return NextResponse.json(
        { error: "Missing or invalid test_id / stock_qty" },
        { status: 400 }
      );
    }

    const nextQty = Math.max(0, Math.floor(stockQty));

    const service = createServiceRoleClient();
    const { error } = await service
      .from("tests")
      .update({ stock_qty: nextQty })
      .eq("id", testId);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update stock: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, stock_qty: nextQty });
  } catch (err) {
    console.error("admin stock update error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
