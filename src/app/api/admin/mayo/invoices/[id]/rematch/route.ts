import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { runAutoMatchForInvoice } from "@/app/api/admin/mayo/invoices/route";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/mayo/invoices/[id]/rematch
 *
 * Re-runs the accession-grouped auto-matcher on this invoice's
 * currently-UNMATCHED lines. Manual matches from earlier drag-drop
 * are preserved (the query filters `order_id IS NULL`).
 *
 * Useful after the matcher algorithm is improved (test-SKU overlap,
 * relaxed thresholds, etc.) so Mike doesn't have to re-upload the
 * PDF to pick up gains.
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
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id: invoiceId } = await params;
  const service = createServiceRoleClient();
  const stats = await runAutoMatchForInvoice(service, invoiceId);
  return NextResponse.json({ ok: true, ...stats });
}
