import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/patients/[id]/results/[resultId]
 *
 * Admin-only. Removes a manually-uploaded result from a patient's
 * repository. Deletes both the storage object and the `results` row.
 *
 * Safety rails:
 *   - The result's profile must belong to the account in the URL.
 *   - Only rows with source='manual_upload' can be deleted via this
 *     endpoint. Order-attached results stay untouched — they should be
 *     removed via the existing /api/results/delete flow which handles
 *     order-status rollback, notification suppression, etc.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; resultId: string }> }
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

    const { id: accountId, resultId } = await params;
    const service = createServiceRoleClient();

    const { data: resultRaw } = await service
      .from("results")
      .select(
        "id, storage_path, source, profile_id, document_type, profile:patient_profiles(account_id)"
      )
      .eq("id", resultId)
      .maybeSingle();
    type ResultShape = {
      id: string;
      storage_path: string;
      source: string;
      profile_id: string;
      document_type: string | null;
      profile: { account_id: string } | { account_id: string }[] | null;
    };
    const row = resultRaw as ResultShape | null;
    if (!row) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    const profileAccountId = Array.isArray(row.profile)
      ? row.profile[0]?.account_id
      : row.profile?.account_id;
    if (profileAccountId !== accountId) {
      return NextResponse.json(
        { error: "Result does not belong to this patient" },
        { status: 403 }
      );
    }

    if (row.source !== "manual_upload") {
      return NextResponse.json(
        {
          error:
            "Order-attached results cannot be deleted from the repository — use the order results flow instead.",
        },
        { status: 400 }
      );
    }

    const { error: deleteErr } = await service
      .from("results")
      .delete()
      .eq("id", resultId);
    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to delete result: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    // Best-effort storage cleanup — the DB row is gone either way
    await service.storage
      .from("results-pdfs")
      .remove([row.storage_path])
      .catch((err) =>
        console.warn("[admin:patients:results:delete] storage remove failed", err)
      );

    await service
      .from("analytics_events")
      .insert({
        event_type: "manual_result_deleted",
        event_data: {
          profile_id: row.profile_id,
          document_type: row.document_type,
          uploaded_by_admin_id: user.id,
          file_count_in_batch: 1,
          result_id: resultId,
        },
        account_id: accountId,
      })
      .then(({ error }) => {
        if (error) {
          console.warn(
            "[admin:patients:results:delete] analytics insert failed:",
            error.message
          );
        }
      });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin:patients:results:delete]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
