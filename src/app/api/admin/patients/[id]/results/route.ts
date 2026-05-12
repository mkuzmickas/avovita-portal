import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import {
  DOCUMENT_UPLOADED_SUBJECT,
  renderDocumentUploadedEmail,
} from "@/lib/emails/documentUploaded";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — matches the 25 MB cap on order-attached PDFs.
const MAX_BATCH_SIZE = 20;

const DOC_TYPES = new Set([
  "lab_result",
  "imaging_report",
  "specialist_report",
  "medical_history",
  "prescription",
  "other",
]);

/**
 * POST /api/admin/patients/[id]/results
 *
 * Admin-only. Uploads one or more PDFs to a patient's repository without
 * requiring an open order. Each file is stored in Supabase Storage under
 *   results/{account_id}/manual/{timestamp}_{safe_filename}
 * and a `results` row inserted with source='manual_upload'.
 *
 * Multipart form fields:
 *   - profile_id (required) — applies to every file in the batch and
 *     must belong to the [id] account
 *   - file (required, repeatable) — one or more PDFs (≤25 MB each, ≤20 per batch)
 *   - meta (required, JSON string) — array, one entry per file in the same
 *     order as the `file` parts:
 *       [{ document_type, document_date|null, description|null, result_status }]
 *   - notify_email (optional, "1" / "true") — when truthy, send a single
 *     "new document in your portal" email after the batch completes
 *
 * Per-file failures don't roll back the rest of the batch — the response
 * lists `uploaded` and `failed` separately so the UI can flag retries.
 *
 * The order-tied "results ready" email is intentionally never sent here.
 * Manual uploads only fire the (optional, separate) notification when
 * notify_email is set.
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
    const metaRaw = formData.get("meta") as string | null;
    const notifyEmail =
      formData.get("notify_email") === "1" ||
      formData.get("notify_email") === "true";

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
    if (files.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `A single batch is limited to ${MAX_BATCH_SIZE} files.` },
        { status: 400 }
      );
    }

    // Parse metadata array — must match files length, in order.
    type FileMeta = {
      document_type: string;
      document_date: string | null;
      description: string | null;
      result_status: "partial" | "final";
    };
    let metas: FileMeta[];
    try {
      const parsed = metaRaw ? JSON.parse(metaRaw) : null;
      if (!Array.isArray(parsed) || parsed.length !== files.length) {
        return NextResponse.json(
          { error: "meta must be an array with one entry per file" },
          { status: 400 }
        );
      }
      metas = parsed.map((m: unknown, idx: number) => {
        const obj = (m ?? {}) as Record<string, unknown>;
        const docType = String(obj.document_type ?? "");
        if (!DOC_TYPES.has(docType)) {
          throw new Error(`File ${idx + 1}: invalid document_type`);
        }
        const status =
          obj.result_status === "partial" ? "partial" : "final";
        const date =
          typeof obj.document_date === "string" && obj.document_date
            ? obj.document_date
            : null;
        const desc =
          typeof obj.description === "string" && obj.description.trim()
            ? obj.description.trim().slice(0, 1000)
            : null;
        return {
          document_type: docType,
          document_date: date,
          description: desc,
          result_status: status,
        };
      });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Invalid meta payload",
        },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    // Verify the profile belongs to this account, and grab name/email
    // for the optional notification email below.
    const { data: profileRaw } = await service
      .from("patient_profiles")
      .select("id, account_id, first_name")
      .eq("id", profileId)
      .maybeSingle();
    const profile = profileRaw as {
      id: string;
      account_id: string;
      first_name: string;
    } | null;
    if (!profile || profile.account_id !== accountId) {
      return NextResponse.json(
        { error: "Profile does not belong to this account" },
        { status: 400 }
      );
    }

    const uploaded: Array<{ id: string; file_name: string }> = [];
    const failed: Array<{ file_name: string; error: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metas[i];
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
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `results/${accountId}/manual/${timestamp}_${i}_${safeName}`;

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
            result_status: meta.result_status,
            uploaded_by: user.id,
            source: "manual_upload",
            document_type: meta.document_type,
            document_date: meta.document_date,
            description: meta.description,
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

    // ── Audit log: one event per upload row that succeeded ──
    if (uploaded.length > 0) {
      const events = uploaded.map((u, idx) => ({
        event_type: "manual_result_uploaded",
        event_data: {
          profile_id: profileId,
          document_type: metas[idx]?.document_type,
          uploaded_by_admin_id: user.id,
          file_count_in_batch: uploaded.length,
          result_id: u.id,
        },
        account_id: accountId,
      }));
      await service
        .from("analytics_events")
        .insert(events)
        .then(({ error }) => {
          if (error) {
            console.warn(
              "[admin:patients:results:upload] analytics insert failed:",
              error.message
            );
          }
        });
    }

    // ── Optional customer notification ──
    let emailSent = false;
    if (notifyEmail && uploaded.length > 0) {
      const { data: ownerRaw } = await service
        .from("accounts")
        .select("email")
        .eq("id", accountId)
        .maybeSingle();
      const owner = ownerRaw as { email: string | null } | null;
      if (owner?.email) {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
        const countLabel =
          uploaded.length === 1
            ? "A new document"
            : `${uploaded.length} new documents`;
        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM_RESULTS!,
            to: owner.email,
            bcc: ["mike@avovita.ca"],
            subject: DOCUMENT_UPLOADED_SUBJECT,
            html: renderDocumentUploadedEmail({
              firstName: profile.first_name,
              portalUrl: appUrl,
              countLabel,
            }),
          });
          emailSent = true;
        } catch (emailErr) {
          console.error(
            "[admin:patients:results:upload] notification email failed:",
            emailErr
          );
        }
      }
    }

    return NextResponse.json({
      uploaded,
      failed,
      total: files.length,
      email_sent: emailSent,
    });
  } catch (err) {
    console.error("[admin:patients:results:upload]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
