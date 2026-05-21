import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * POST /api/results/replace
 *
 * Admin-only. Replace a single existing order-attached PDF with a new
 * file: same `results` row, new storage object, old storage object
 * removed. Does NOT send any notification (replacement is operational
 * housekeeping — the customer already got the original email).
 *
 * Multipart form fields:
 *   - result_id (required)
 *   - file (required, PDF, ≤25 MB)
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
    const { data: accountRaw } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();
    const account = accountRaw as { role: string } | null;
    if (!account || account.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const resultId = formData.get("result_id") as string | null;
    const file = formData.get("file") as File | null;

    if (!resultId || !file) {
      return NextResponse.json(
        { error: "result_id and file are required" },
        { status: 400 }
      );
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 25 MB limit" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    // Resolve the row + the order it belongs to (for storage path + audit).
    const { data: existingRaw } = await service
      .from("results")
      .select("id, order_id, storage_path, order:orders(account_id)")
      .eq("id", resultId)
      .maybeSingle();
    type ExistingShape = {
      id: string;
      order_id: string | null;
      storage_path: string;
      order:
        | { account_id: string | null }
        | { account_id: string | null }[]
        | null;
    };
    const existing = existingRaw as ExistingShape | null;
    if (!existing) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }
    if (!existing.order_id) {
      return NextResponse.json(
        { error: "Replace is only supported for order-attached results" },
        { status: 400 }
      );
    }
    const orderAccountId = Array.isArray(existing.order)
      ? existing.order[0]?.account_id ?? null
      : existing.order?.account_id ?? null;

    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `results/${orderAccountId}/${existing.order_id}/${timestamp}_${safeFileName}`;

    const buffer = await file.arrayBuffer();
    const { error: uploadErr } = await service.storage
      .from("results-pdfs")
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadErr) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    const { error: updateErr } = await service
      .from("results")
      .update({
        storage_path: storagePath,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
        viewed_at: null,
        uploaded_by: user.id,
      })
      .eq("id", resultId);
    if (updateErr) {
      await service.storage
        .from("results-pdfs")
        .remove([storagePath])
        .catch(() => undefined);
      return NextResponse.json(
        { error: `Failed to update result: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // Best-effort cleanup of the old storage object.
    if (existing.storage_path && existing.storage_path !== storagePath) {
      await service.storage
        .from("results-pdfs")
        .remove([existing.storage_path])
        .catch(() => undefined);
    }

    await service
      .from("analytics_events")
      .insert({
        event_type: "order_result_pdf_replaced",
        event_data: {
          order_id: existing.order_id,
          result_id: resultId,
          admin_user_id: user.id,
        },
        account_id: orderAccountId,
      })
      .then(({ error }) => {
        if (error)
          console.warn(
            "[results:replace] analytics insert failed:",
            error.message
          );
      });

    return NextResponse.json({
      result_id: resultId,
      file_name: file.name,
      success: true,
    });
  } catch (err) {
    console.error("[results:replace]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
