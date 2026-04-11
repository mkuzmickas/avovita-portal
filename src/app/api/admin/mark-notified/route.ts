import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { DIRECT_DELIVERY_SENTINEL } from "@/lib/admin-stats";

export const runtime = "nodejs";

/**
 * POST /api/admin/mark-notified
 *
 * Admin-only endpoint that records a "direct delivery" acknowledgement for an
 * order line whose lab delivers results outside the AvoVita portal
 * (Dynacare / ReligenDx / Precision Epigenomics — labs with
 * results_visibility='none').
 *
 * Inserts a sentinel row into `results` so the admin workflow can treat the
 * line as resolved without uploading a PDF. The storage_path / file_name
 * columns are NOT NULL in the schema; the sentinel values satisfy that
 * constraint and are filtered out by the patient-facing results page.
 *
 * Body: { order_line_id: string }
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
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const body = await request.json();
    const orderLineId: string | undefined = body.order_line_id;

    if (!orderLineId) {
      return NextResponse.json(
        { error: "Missing order_line_id" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    // Fetch the order line with its lab + order context
    const { data: orderLineRaw, error: lineErr } = await service
      .from("order_lines")
      .select(
        `
        id, profile_id, order_id,
        test:tests(name, lab:labs(name, results_visibility))
      `
      )
      .eq("id", orderLineId)
      .single();

    if (lineErr || !orderLineRaw) {
      return NextResponse.json(
        { error: "Order line not found" },
        { status: 404 }
      );
    }

    type OrderLineShape = {
      id: string;
      profile_id: string;
      order_id: string;
      test: {
        name: string;
        lab: { name: string; results_visibility: string } | null;
      } | null;
    };
    const orderLine = orderLineRaw as unknown as OrderLineShape;

    const labName = orderLine.test?.lab?.name ?? "lab";
    const visibility = orderLine.test?.lab?.results_visibility ?? "full";

    if (visibility !== "none") {
      return NextResponse.json(
        {
          error:
            "This lab requires PDF upload — direct delivery acknowledgement not allowed",
        },
        { status: 400 }
      );
    }

    // Check whether a result row already exists (prevent duplicates)
    const { data: existing } = await service
      .from("results")
      .select("id")
      .eq("order_line_id", orderLineId)
      .limit(1);

    if ((existing as Array<{ id: string }> | null)?.length) {
      return NextResponse.json(
        { error: "Result already recorded for this order line" },
        { status: 409 }
      );
    }

    // Insert sentinel result row
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertErr } = await service
      .from("results")
      .insert({
        order_line_id: orderLine.id,
        profile_id: orderLine.profile_id,
        lab_reference_number: null,
        storage_path: DIRECT_DELIVERY_SENTINEL,
        file_name: `Direct delivery — ${labName}`,
        uploaded_by: user.id,
        notified_at: nowIso,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: `Failed to record: ${insertErr?.message}` },
        { status: 500 }
      );
    }

    // Log a notification row so the notifications table reflects the action
    await service.from("notifications").insert({
      profile_id: orderLine.profile_id,
      order_id: orderLine.order_id,
      result_id: (inserted as { id: string }).id,
      channel: "email",
      template: "direct_delivery_ack",
      recipient: "direct-delivery@internal",
      status: "sent",
    });

    // If all order lines in this order now have results, mark order complete.
    const { data: remainingLinesRaw } = await service
      .from("order_lines")
      .select(
        `
        id,
        result:results(id)
      `
      )
      .eq("order_id", orderLine.order_id);

    type RemainingLine = { id: string; result: Array<{ id: string }> };
    const remainingLines =
      (remainingLinesRaw as unknown as RemainingLine[]) ?? [];
    const allResolved =
      remainingLines.length > 0 &&
      remainingLines.every((l) => l.result.length > 0);

    if (allResolved) {
      await service
        .from("orders")
        .update({ status: "complete" })
        .eq("id", orderLine.order_id);
    }

    return NextResponse.json({
      success: true,
      result_id: (inserted as { id: string }).id,
      order_completed: allResolved,
    });
  } catch (err) {
    console.error("mark-notified error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
