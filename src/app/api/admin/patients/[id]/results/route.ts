import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/patients/[id]/results
 *
 * Admin-only. Uploads one or more PDFs to a patient's repository without
 * requiring an open order. Each file is stored in Supabase Storage under
 *   results/{account_id}/manual/{timestamp}_{safe_filename}
 * and a `results` row inserted with source='manual_upload'.
 *
 * Multipart form fields:
 *   - profile_id (required) — must belong to the [id] account
 *   - file (required, repeatable) — one or more PDFs
 *
 * Intentionally does NOT send any notification. Manual uploads are
 * silent — only order-attached uploads via /api/results/upload fire
 * the patient notification flow.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: accountId } = await params;
    const formData = await request.formData();
    const profileId = formData.get("profile_id") as string | null;
    const files = formData.getAll("file") as File[];

    if (!profileId) {
      return NextResponse.json(
        { error: "profile_id is required" },
        { status: 400 }
      );
    }
    if (files.length === 0) {
      return NextResponse.json(
        { error: "At least one file is required" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    // Verify the profile belongs to this account
    const { data: profileRaw } = await service
      .from("patient_profiles")
      .select("id, account_id")
      .eq("id", profileId)
      .maybeSingle();
    const profile = profileRaw as { id: string; account_id: string } | null;
    if (!profile || profile.account_id !== accountId) {
      return NextResponse.json(
        { error: "Profile does not belong to this account" },
        { status: 400 }
      );
    }

    const uploaded: Array<{ id: string; file_name: string }> = [];
    const failed: Array<{ file_name: string; error: string }> = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;
      if (file.type !== "application/pdf") {
        failed.push({
          file_name: file.name,
          error: "Only PDF files are accepted",
        });
        continue;
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `results/${accountId}/manual/${timestamp}_${safeName}`;

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
            order_id: null,
            profile_id: profileId,
            storage_path: storagePath,
            file_name: file.name,
            result_status: "final",
            uploaded_by: user.id,
            source: "manual_upload",
          })
          .select("id")
          .single();
        if (insertErr || !insertedRaw) {
          // Roll back the upload to avoid orphan storage objects
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

    return NextResponse.json({
      uploaded,
      failed,
      total: files.length,
    });
  } catch (err) {
    console.error("[admin:patients:results:upload]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
