import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

    const { result_id } = await request.json();
    if (!result_id) {
      return NextResponse.json(
        { error: "Missing result_id" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    const { data: resultRaw } = await service
      .from("results")
      .select("id, storage_path, order_id")
      .eq("id", result_id)
      .single();

    const result = resultRaw as {
      id: string;
      storage_path: string;
      order_id: string;
    } | null;

    if (!result) {
      return NextResponse.json(
        { error: "Result not found" },
        { status: 404 }
      );
    }

    // Delete file from storage
    if (result.storage_path && !result.storage_path.startsWith("__")) {
      await service.storage
        .from("results-pdfs")
        .remove([result.storage_path])
        .catch(() => {});
    }

    // Delete the result record
    await service.from("results").delete().eq("id", result.id);

    // Reset order status back to shipped (or confirmed if it was never shipped)
    const { data: orderRaw } = await service
      .from("orders")
      .select("shipped_at")
      .eq("id", result.order_id)
      .single();
    const order = orderRaw as { shipped_at: string | null } | null;

    const resetStatus = order?.shipped_at ? "shipped" : "confirmed";
    await service
      .from("orders")
      .update({ status: resetStatus })
      .eq("id", result.order_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[results/delete] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
