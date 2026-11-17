import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { cancelShipment } from "@/lib/fedex/cancel";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/shipping/cancel-label/[id]
 *
 * Admin-only. Looks up the manual_shipments row by id, calls FedEx's
 * /ship/v1/shipments/cancel to void the label at FedEx, and (on
 * success) removes the local audit row. Fails cleanly if FedEx
 * rejects the cancel (e.g. "package already picked up") — in that
 * case the audit row stays so Mike can see which one FedEx wouldn't
 * void.
 *
 * Separate from the plain DELETE at /manual-shipments/[id], which
 * ONLY clears the local row and does not touch FedEx.
 */
export async function POST(
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
      { error: "Admin only — FloLabs cannot cancel labels." },
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

  const tracking = (existing as { tracking_number: string | null })
    .tracking_number;
  if (!tracking) {
    return NextResponse.json(
      { error: "No tracking number on this shipment." },
      { status: 400 },
    );
  }

  // Fire the cancel at FedEx first. If FedEx refuses (picked up / already
  // delivered), we leave the local row alone so the audit still shows
  // the live shipment.
  let fedexResult;
  try {
    fedexResult = await cancelShipment(tracking);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `FedEx cancel request failed: ${msg}`,
        suggestion:
          "Try cancelling directly on fedex.com. If the label hasn't been scanned yet, it can still be voided manually.",
      },
      { status: 502 },
    );
  }

  if (!fedexResult.cancelled) {
    return NextResponse.json(
      {
        cancelled: false,
        error: fedexResult.message,
        suggestion:
          "FedEx refused the cancel. Usually means the package has already been picked up or delivered. If you still need to stop it, call FedEx billing — the API can't void a label that's in motion.",
      },
      { status: 409 },
    );
  }

  // FedEx voided the label. Remove the local audit row so it drops
  // out of the Recent Shipments list.
  const { error: deleteErr } = await service
    .from("manual_shipments")
    .delete()
    .eq("id", id);
  if (deleteErr) {
    console.warn(
      "[cancel-label] FedEx voided but local delete failed:",
      deleteErr.message,
    );
  }

  // Analytics trail — matches the DELETE endpoint's pattern.
  await service
    .from("analytics_events")
    .insert({
      event_type: "manual_shipment_cancelled",
      event_data: {
        shipment_id: id,
        tracking_number: tracking,
        profile_kind: (existing as { profile_kind: string }).profile_kind,
        cancelled_by_admin_id: user.id,
        fedex_message: fedexResult.message,
      },
      account_id: user.id,
    })
    .then(({ error }) => {
      if (error) {
        console.warn(
          "[cancel-label] analytics insert failed:",
          error.message,
        );
      }
    });

  return NextResponse.json({
    cancelled: true,
    message: fedexResult.message,
    tracking_number: tracking,
  });
}
