import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/results/delete
 *
 * Admin-only. Delete a single order-attached results row (storage +
 * DB). Now that orders can carry multiple PDFs, the order status is
 * only rewound to 'shipped' / 'confirmed' when no PDFs remain — if
 * other PDFs still exist for the order, the existing 'complete' /
 * 'resulted' status is preserved (recomputed from the most recent
 * remaining result_status: any 'final' → 'complete', else 'resulted').
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
      .select(
        "id, storage_path, order_id, order:orders(account_id, shipped_at)"
      )
      .eq("id", result_id)
      .single();
    type ResultShape = {
      id: string;
      storage_path: string;
      order_id: string;
      order:
        | { account_id: string | null; shipped_at: string | null }
        | { account_id: string | null; shipped_at: string | null }[]
        | null;
    };
    const result = resultRaw as ResultShape | null;
    if (!result) {
      return NextResponse.json(
        { error: "Result not found" },
        { status: 404 }
      );
    }
    const orderAccountId = Array.isArray(result.order)
      ? result.order[0]?.account_id ?? null
      : result.order?.account_id ?? null;
    const orderShippedAt = Array.isArray(result.order)
      ? result.order[0]?.shipped_at ?? null
      : result.order?.shipped_at ?? null;

    if (result.storage_path && !result.storage_path.startsWith("__")) {
      await service.storage
        .from("results-pdfs")
        .remove([result.storage_path])
        .catch(() => undefined);
    }
    await service.from("results").delete().eq("id", result.id);

    // Recompute order status from whatever PDFs remain.
    const { data: remainingRaw } = await service
      .from("results")
      .select("result_status")
      .eq("order_id", result.order_id);
    const remaining =
      (remainingRaw as Array<{ result_status: string }> | null) ?? [];

    let newStatus: string;
    if (remaining.length === 0) {
      newStatus = orderShippedAt ? "shipped" : "confirmed";
    } else if (remaining.some((r) => r.result_status === "final")) {
      newStatus = "complete";
    } else {
      newStatus = "resulted";
    }
    await service
      .from("orders")
      .update({ status: newStatus })
      .eq("id", result.order_id);

    await service
      .from("analytics_events")
      .insert({
        event_type: "order_result_pdf_deleted",
        event_data: {
          order_id: result.order_id,
          result_id,
          admin_user_id: user.id,
          remaining_pdf_count: remaining.length,
        },
        account_id: orderAccountId,
      })
      .then(({ error }) => {
        if (error)
          console.warn(
            "[results:delete] analytics insert failed:",
            error.message
          );
      });

    return NextResponse.json({
      success: true,
      remaining_pdf_count: remaining.length,
      new_order_status: newStatus,
    });
  } catch (err) {
    console.error("[results/delete] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
