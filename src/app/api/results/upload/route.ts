import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per PDF
const MAX_BATCH_SIZE = 20;

/**
 * POST /api/results/upload
 *
 * Admin-only. Uploads 1..N PDFs to an order in a single batch and sends
 * the customer results-ready email ONCE for the whole batch. Replacing
 * an existing PDF is a separate operation — see /api/results/replace.
 *
 * Status model: result_status is per-row in the DB (legacy), but at
 * upload time the admin picks one Final/Partial value that's applied to
 * every PDF in the batch. The orders.status workflow honours the batch
 * status: 'final' → order 'complete', 'partial' → order 'resulted'.
 * Subsequent batches re-set the order status to match their own status,
 * which mirrors the previous single-PDF behaviour.
 *
 * Multipart form fields:
 *   - order_id (required)
 *   - result_status: "partial" | "final" (default: "final")
 *   - lab_reference_number (optional, applied to every row in the batch)
 *   - file (required, repeatable, up to 20 per batch, ≤25 MB each)
 *
 * Per-file failures don't roll back the rest of the batch — the
 * response lists `uploaded` and `failed` separately. The notify email
 * fires only if at least one upload succeeded.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!account || account.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const orderId = formData.get("order_id") as string | null;
    const resultStatus =
      (formData.get("result_status") as string) || "final";
    const labReferenceNumber = formData.get("lab_reference_number") as
      | string
      | null;
    const files = formData.getAll("file") as File[];

    // Optional per-file mismatch overrides. The admin UI only includes
    // entries for files where the parsed PDF name didn't match the
    // client's profile name AND the admin explicitly ticked "Override
    // and upload anyway". For each entry we write an analytics_events
    // audit row after the corresponding result row is created.
    type OverrideEntry = {
      file_name: string;
      detected_pdf_name: string | null;
      client_profile_name: string | null;
    };
    let overrides: OverrideEntry[] = [];
    const overridesRaw = formData.get("mismatch_overrides") as string | null;
    if (overridesRaw) {
      try {
        const parsed = JSON.parse(overridesRaw);
        if (Array.isArray(parsed)) {
          overrides = parsed.filter(
            (o): o is OverrideEntry =>
              !!o && typeof o.file_name === "string",
          );
        }
      } catch {
        // Malformed payload — ignore. The UI is the only caller, and a
        // bad payload here shouldn't fail the entire batch.
      }
    }
    const overrideByFilename = new Map(overrides.map((o) => [o.file_name, o]));

    if (!orderId) {
      return NextResponse.json(
        { error: "order_id is required" },
        { status: 400 }
      );
    }
    if (files.length === 0) {
      return NextResponse.json(
        { error: "At least one file is required" },
        { status: 400 }
      );
    }
    if (files.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `A single batch is limited to ${MAX_BATCH_SIZE} files.` },
        { status: 400 }
      );
    }
    if (!["partial", "final"].includes(resultStatus)) {
      return NextResponse.json(
        { error: "result_status must be partial or final" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    // Resolve the order + its primary profile (same row used for every
    // PDF in this batch — there's no per-PDF profile concept here).
    const { data: orderRaw, error: orderErr } = await service
      .from("orders")
      .select("id, account_id")
      .eq("id", orderId)
      .single();
    if (orderErr || !orderRaw) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const order = orderRaw as { id: string; account_id: string | null };

    const { data: primaryProfileRaw } = await service
      .from("patient_profiles")
      .select("id")
      .eq("account_id", order.account_id ?? "")
      .eq("is_primary", true)
      .maybeSingle();
    const profileId =
      (primaryProfileRaw as { id: string } | null)?.id ?? null;
    if (!profileId) {
      return NextResponse.json(
        { error: "No patient profile found for this order" },
        { status: 400 }
      );
    }

    const uploaded: Array<{ id: string; file_name: string }> = [];
    const failed: Array<{ file_name: string; error: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File)) continue;
      if (file.type !== "application/pdf") {
        failed.push({
          file_name: file.name,
          error: "Only PDF files are accepted",
        });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        failed.push({
          file_name: file.name,
          error: "File exceeds 25 MB limit",
        });
        continue;
      }

      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `results/${order.account_id}/${orderId}/${timestamp}_${i}_${safeFileName}`;

      try {
        const buffer = await file.arrayBuffer();
        const { error: uploadErr } = await service.storage
          .from("results-pdfs")
          .upload(storagePath, buffer, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (uploadErr) throw new Error(uploadErr.message);

        const { data: insertedRaw, error: insertErr } = await service
          .from("results")
          .insert({
            order_id: orderId,
            profile_id: profileId,
            lab_reference_number: labReferenceNumber?.trim() || null,
            storage_path: storagePath,
            file_name: file.name,
            result_status: resultStatus,
            uploaded_by: user.id,
          })
          .select("id")
          .single();
        if (insertErr || !insertedRaw) {
          await service.storage
            .from("results-pdfs")
            .remove([storagePath])
            .catch(() => undefined);
          throw new Error(insertErr?.message ?? "DB insert failed");
        }
        uploaded.push({
          id: (insertedRaw as { id: string }).id,
          file_name: file.name,
        });
      } catch (err) {
        failed.push({
          file_name: file.name,
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    let notified = false;
    if (uploaded.length > 0) {
      // Set order status from the batch's chosen Final/Partial value.
      const newOrderStatus =
        resultStatus === "final" ? "complete" : "resulted";
      await service
        .from("orders")
        .update({ status: newOrderStatus })
        .eq("id", orderId);

      // Send ONE email for the whole batch. /api/notify is per-result_id
      // (the template content doesn't enumerate every PDF — it's a
      // "results are ready, sign in to view" message), so we just pick
      // one of the uploaded result_ids to drive the call.
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
      try {
        const notifyRes = await fetch(`${appUrl}/api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            result_id: uploaded[uploaded.length - 1].id,
            result_status: resultStatus,
          }),
        });
        notified = notifyRes.ok;
      } catch (err) {
        console.error("[results:upload] notify failed:", err);
      }
    }

    // Audit event — one row per successful batch.
    if (uploaded.length > 0) {
      await service
        .from("analytics_events")
        .insert({
          event_type: "order_results_batch_uploaded",
          event_data: {
            order_id: orderId,
            pdf_count: uploaded.length,
            status: resultStatus,
            admin_user_id: user.id,
            notified,
          },
          account_id: order.account_id,
        })
        .then(({ error }) => {
          if (error)
            console.warn(
              "[results:upload] analytics insert failed:",
              error.message
            );
        });
    }

    // Per-file mismatch-override audit rows. Written separately from
    // the batch event so each override gets its own queryable row with
    // the detected vs profile name pair, enabling a later "show me
    // every override in the last 90 days" investigation.
    const uploadedAtIso = new Date().toISOString();
    const overrideRows = uploaded
      .map((u) => {
        const o = overrideByFilename.get(u.file_name);
        if (!o) return null;
        return {
          event_type: "results_upload_mismatch_override",
          event_data: {
            order_id: orderId,
            results_row_id: u.id,
            admin_user_id: user.id,
            pdf_filename: u.file_name,
            detected_pdf_name: o.detected_pdf_name,
            client_profile_name: o.client_profile_name,
            uploaded_at: uploadedAtIso,
          },
          account_id: order.account_id,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (overrideRows.length > 0) {
      await service
        .from("analytics_events")
        .insert(overrideRows)
        .then(({ error }) => {
          if (error)
            console.warn(
              "[results:upload] override audit insert failed:",
              error.message
            );
        });
    }

    return NextResponse.json({
      uploaded,
      failed,
      total: files.length,
      notified,
    });
  } catch (err) {
    console.error("Result upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
