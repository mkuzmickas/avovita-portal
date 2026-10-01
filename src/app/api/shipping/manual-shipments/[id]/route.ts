import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * DELETE /api/shipping/manual-shipments/[id]
 *
 * Admin-only. Removes a manual_shipments row from the Recent
 * Shipments audit list. Used for cleaning up labels that were
 * created but never actually shipped — the FedEx label-created rows
 * that clutter the list otherwise.
 *
 * NOT token-gated the way /create-label is. FloLabs has the token
 * (so they can print labels) but must not be able to delete audit
 * records — those are the shipment history AvoVita needs for
 * reconciliation. Admin session only.
 *
 * This endpoint ONLY deletes the local audit row. It does not call
 * FedEx to cancel/void the label — if the label was never used
 * FedEx charges nothing for it, and if it WAS used, deleting the
 * row is wrong anyway. Cancel inside FedEx first if the label is
 * live and billable.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") {
    return NextResponse.json(
      { error: "Admin only — FloLabs cannot delete shipment records." },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id required." }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: existing, error: lookupErr } = await service
    .from("manual_shipments")
    .select("id, tracking_number, profile_kind")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { error: `Lookup failed: ${lookupErr.message}` },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  const { error: deleteErr } = await service
    .from("manual_shipments")
    .delete()
    .eq("id", id);
  if (deleteErr) {
    return NextResponse.json(
      { error: `Delete failed: ${deleteErr.message}` },
      { status: 500 },
    );
  }

  // Audit trail — these rows ARE the shipping audit, so removing one
  // leaves a hole. Log the deletion so there's a trace in
  // analytics_events of which tracking number went away and who did it.
  await service
    .from("analytics_events")
    .insert({
      event_type: "manual_shipment_deleted",
      event_data: {
        deleted_shipment_id: id,
        tracking_number: (
          existing as { tracking_number: string | null }
        ).tracking_number,
        profile_kind: (existing as { profile_kind: string }).profile_kind,
        deleted_by_admin_id: user.id,
      },
      account_id: user.id,
    })
    .then(({ error }) => {
      if (error) {
        console.warn(
          "[manual-shipments:delete] analytics insert failed:",
          error.message,
        );
      }
    });

  return NextResponse.json({ deleted: true });
}
