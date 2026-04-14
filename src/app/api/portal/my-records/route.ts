import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * POST /api/portal/my-records
 *
 * Patient self-upload of their own PDFs (previous results from other labs,
 * doctor reports, etc.). Attached to the patient's primary profile on
 * their own account. Stored in Supabase Storage at:
 *   results/{account_id}/patient/{timestamp}_{safe_filename}
 *
 * No notifications fired. `source='patient_upload'` distinguishes these
 * from admin manual uploads and order-attached results.
 *
 * Multipart form fields:
 *   - file (required, repeatable) — one or more PDFs ≤ 20 MB each
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

    const service = createServiceRoleClient();

    // Resolve the patient's primary profile — that's where their self-
    // uploads attach. Additional profiles (spouse, kids) belong to the
    // same account holder, so primary is the right anchor.
    const { data: profileRaw } = await service
      .from("patient_profiles")
      .select("id")
      .eq("account_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();
    const profile = profileRaw as { id: string } | null;
    if (!profile) {
      return NextResponse.json(
        {
          error:
            "No patient profile found on your account. Please complete your profile before uploading records.",
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("file") as File[];
    if (files.length === 0) {
      return NextResponse.json(
        { error: "At least one file is required" },
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
      if (file.size > MAX_BYTES) {
        failed.push({
          file_name: file.name,
          error: `File exceeds 20 MB limit (${Math.round(file.size / 1024 / 1024)} MB)`,
        });
        continue;
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `results/${user.id}/patient/${timestamp}_${safeName}`;

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
            profile_id: profile.id,
            storage_path: storagePath,
            file_name: file.name,
            result_status: "final",
            uploaded_by: user.id,
            source: "patient_upload",
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

    return NextResponse.json({
      uploaded,
      failed,
      total: files.length,
    });
  } catch (err) {
    console.error("[portal:my-records:upload]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
