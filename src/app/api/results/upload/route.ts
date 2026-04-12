import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/results/upload
 *
 * Admin-only. Uploads a PDF result for an entire order (not per order
 * line). If a result already exists for this order_id the existing
 * record is updated in-place (storage_path, file_name, uploaded_at,
 * notified_at reset to null, result_status, lab_reference_number).
 *
 * Multipart form fields:
 *   - order_id (required)
 *   - result_status: "partial" | "final" (default: "final")
 *   - lab_reference_number (optional)
 *   - file: PDF (required)
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
    const orderId = formData.get("order_id") as string;
    const resultStatus =
      (formData.get("result_status") as string) || "final";
    const labReferenceNumber = formData.get("lab_reference_number") as
      | string
      | null;
    const file = formData.get("file") as File | null;

    if (!orderId || !file) {
      return NextResponse.json(
        { error: "Missing required fields: order_id, file" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    if (!["partial", "final"].includes(resultStatus)) {
      return NextResponse.json(
        { error: "result_status must be partial or final" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Look up the order to get the account_id for the storage path
    const { data: orderRaw, error: orderErr } = await serviceClient
      .from("orders")
      .select("id, account_id")
      .eq("id", orderId)
      .single();

    if (orderErr || !orderRaw) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }
    const order = orderRaw as { id: string; account_id: string | null };

    // Find the primary profile for this order's account (for the result row)
    const { data: primaryProfileRaw } = await serviceClient
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

    // Build storage path
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `results/${order.account_id}/${orderId}/${timestamp}_${safeFileName}`;

    // Upload PDF to private Supabase storage bucket
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await serviceClient.storage
      .from("results-pdfs")
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Check if a result already exists for this order
    const { data: existingResultRaw } = await serviceClient
      .from("results")
      .select("id, storage_path")
      .eq("order_id", orderId)
      .maybeSingle();

    const existingResult = existingResultRaw as {
      id: string;
      storage_path: string;
    } | null;

    let resultId: string;

    if (existingResult) {
      // Update existing result in place
      const { error: updateErr } = await serviceClient
        .from("results")
        .update({
          storage_path: storagePath,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
          notified_at: null,
          viewed_at: null,
          result_status: resultStatus,
          lab_reference_number: labReferenceNumber?.trim() || null,
          uploaded_by: user.id,
        })
        .eq("id", existingResult.id);

      if (updateErr) {
        return NextResponse.json(
          { error: `Failed to update result: ${updateErr.message}` },
          { status: 500 }
        );
      }
      resultId = existingResult.id;

      // Delete the old file from storage (best-effort)
      if (existingResult.storage_path !== storagePath) {
        await serviceClient.storage
          .from("results-pdfs")
          .remove([existingResult.storage_path])
          .catch(() => {});
      }
    } else {
      // Insert new result
      const { data: insertedRaw, error: insertErr } = await serviceClient
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
        await serviceClient.storage
          .from("results-pdfs")
          .remove([storagePath]);
        return NextResponse.json(
          { error: `Failed to save result: ${insertErr?.message}` },
          { status: 500 }
        );
      }
      resultId = (insertedRaw as { id: string }).id;
    }

    // Trigger notification with result_status
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
    await fetch(`${appUrl}/api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result_id: resultId, result_status: resultStatus }),
    });

    return NextResponse.json({
      result_id: resultId,
      replaced: !!existingResult,
      success: true,
    });
  } catch (error) {
    console.error("Result upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
