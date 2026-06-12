import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ParsedPendingBatchRow } from "@/lib/mayo/parsePendingBatchCsv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AcceptItem {
  order_id: string;
  profile_id: string;
  csv_row: ParsedPendingBatchRow;
  confidence: "exact" | "high" | "medium" | "low" | "none";
  reasoning: string;
}

interface PostBody {
  items: AcceptItem[];
}

interface ItemResult {
  order_id: string;
  outcome: "stamped" | "already_stamped" | "skipped_no_change" | "error";
  message: string;
}

/**
 * POST /api/admin/mayo/pending-batch/accept
 *
 * Atomically stamps Mayo identifiers onto the matched portal order
 * and patient profile, and writes one analytics_events audit row per
 * accepted item. Idempotent — if the portal order already has a
 * mayo_order_number set, this is a no-op (outcome=already_stamped)
 * and no audit row is written.
 *
 * Per spec: never overwrite an existing identifier. Mike asked for
 * re-import safety so the same CSV can be dropped daily without
 * audit-log noise.
 *
 * Admin-only.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: callerRaw } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((callerRaw as { role?: string } | null)?.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden — admin only" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as PostBody | null;
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "items[] required" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const results: ItemResult[] = [];

  for (const item of body.items) {
    if (!item.order_id || !item.profile_id || !item.csv_row) {
      results.push({
        order_id: item.order_id ?? "(unknown)",
        outcome: "error",
        message: "Missing order_id/profile_id/csv_row",
      });
      continue;
    }

    const mayoOrderNumber = item.csv_row.mayo_order_number?.trim();
    const mayoPatientId = item.csv_row.mayo_patient_id?.trim();
    if (!mayoOrderNumber || !mayoPatientId) {
      results.push({
        order_id: item.order_id,
        outcome: "error",
        message: "CSV row missing Mayo Order Number or Medical Record Number",
      });
      continue;
    }

    // Check current state. Service-role read so RLS doesn't bite.
    const { data: orderRow, error: orderErr } = await service
      .from("orders")
      .select("id, account_id, mayo_order_number, mayo_patient_id")
      .eq("id", item.order_id)
      .maybeSingle();
    if (orderErr || !orderRow) {
      results.push({
        order_id: item.order_id,
        outcome: "error",
        message: "Portal order not found",
      });
      continue;
    }

    const typedOrder = orderRow as {
      id: string;
      account_id: string;
      mayo_order_number: string | null;
      mayo_patient_id: string | null;
    };

    // Already stamped with the SAME Mayo order number — idempotent
    // re-import. Skip silently, no audit row.
    if (typedOrder.mayo_order_number === mayoOrderNumber) {
      results.push({
        order_id: item.order_id,
        outcome: "already_stamped",
        message: `Portal order already linked to ${mayoOrderNumber}`,
      });
      continue;
    }

    // Refuse to overwrite an existing DIFFERENT mayo number — that's
    // either a mistake or a data-integrity issue. Surface it.
    if (
      typedOrder.mayo_order_number &&
      typedOrder.mayo_order_number !== mayoOrderNumber
    ) {
      results.push({
        order_id: item.order_id,
        outcome: "error",
        message: `Portal order already stamped with a different Mayo order (${typedOrder.mayo_order_number}). Refusing to overwrite — investigate before re-running.`,
      });
      continue;
    }

    // Stamp the order. Only set fields that are currently null so an
    // earlier partial stamp can't be clobbered.
    const orderPatch: Record<string, string> = {
      mayo_order_number: mayoOrderNumber,
    };
    if (!typedOrder.mayo_patient_id) {
      orderPatch.mayo_patient_id = mayoPatientId;
    }
    const { error: updateOrderErr } = await service
      .from("orders")
      .update(orderPatch)
      .eq("id", item.order_id);
    if (updateOrderErr) {
      results.push({
        order_id: item.order_id,
        outcome: "error",
        message: `Failed to update order: ${updateOrderErr.message}`,
      });
      continue;
    }

    // Stamp the profile's MRN if not already set.
    const { data: profileRow } = await service
      .from("patient_profiles")
      .select("id, mayo_patient_id")
      .eq("id", item.profile_id)
      .maybeSingle();
    if (
      profileRow &&
      !(profileRow as { mayo_patient_id: string | null }).mayo_patient_id
    ) {
      await service
        .from("patient_profiles")
        .update({ mayo_patient_id: mayoPatientId })
        .eq("id", item.profile_id);
    }

    // Audit.
    await service
      .from("analytics_events")
      .insert({
        event_type: "mayo_pending_batch_imported",
        event_data: {
          portal_order_id: item.order_id,
          portal_profile_id: item.profile_id,
          mayo_order_number: mayoOrderNumber,
          mayo_patient_id: mayoPatientId,
          confidence: item.confidence,
          reasoning: item.reasoning,
          csv_row: item.csv_row,
          admin_user_id: user.id,
          via: "admin_ui",
        },
        account_id: typedOrder.account_id,
      })
      .then(({ error }) => {
        if (error) {
          console.warn(
            "[mayo:accept] analytics insert failed:",
            error.message,
          );
        }
      });

    results.push({
      order_id: item.order_id,
      outcome: "stamped",
      message: `Stamped Mayo order ${mayoOrderNumber} on portal order ${item.order_id.slice(0, 8).toUpperCase()}`,
    });
  }

  return NextResponse.json({ results });
}
