import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * DELETE /api/portal/my-records/[resultId]
 *
 * Patient-only. Deletes a PDF the patient themselves uploaded. Refuses
 * to touch rows with source='order' (AvoVita-issued results) or
 * source='manual_upload' (admin-uploaded) — those belong to staff.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { resultId } = await params;
    const service = createServiceRoleClient();

    const { data: resultRaw } = await service
      .from("results")
      .select(
        "id, storage_path, source, uploaded_by, profile:patient_profiles(account_id)"
      )
      .eq("id", resultId)
      .maybeSingle();
    type Row = {
      id: string;
      storage_path: string;
      source: string;
      uploaded_by: string;
      profile: { account_id: string } | { account_id: string }[] | null;
    };
    const row = resultRaw as Row | null;
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const profileAccountId = Array.isArray(row.profile)
      ? row.profile[0]?.account_id
      : row.profile?.account_id;
    if (profileAccountId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (row.source !== "patient_upload") {
      return NextResponse.json(
        {
          error:
            "You can only delete files you uploaded yourself. AvoVita-issued results and admin-added files cannot be removed from your portal.",
        },
        { status: 403 }
      );
    }

    const { error: deleteErr } = await service
      .from("results")
      .delete()
      .eq("id", resultId);
    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to delete: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    await service.storage
      .from("results-pdfs")
      .remove([row.storage_path])
      .catch((err) =>
        console.warn("[portal:my-records:delete] storage remove failed", err)
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[portal:my-records:delete]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
