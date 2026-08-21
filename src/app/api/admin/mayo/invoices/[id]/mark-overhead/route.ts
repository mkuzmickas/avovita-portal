import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/mayo/invoices/[id]/mark-overhead
 *
 * Body: { line_ids: string[], overhead: boolean }
 *
 * Flag a set of invoice lines as "no portal order" (overhead / internal
 * use — the cost is real but there's no client revenue tied to it).
 * Clears order_id + matched_at + matched_by first because the CHECK
 * constraint disallows a line being both matched and overhead. Setting
 * overhead=false clears the flag (reverts to unmatched).
 *
 * Typically called per-accession from the matcher UI, so line_ids is
 * every line for a patient/accession.
 */
export async function POST(
  request: NextRequest,
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
    .select("role, email")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role" | "email"> | null };
  if (account?.role !== "admin") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id: invoiceId } = await params;

  let body: { line_ids?: string[]; overhead?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const ids = Array.isArray(body.line_ids) ? body.line_ids : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "line_ids required." },
      { status: 400 },
    );
  }
  const overhead = body.overhead === true;

  const service = createServiceRoleClient();
  const patch = overhead
    ? {
        order_id: null,
        matched_at: new Date().toISOString(),
        matched_by: `overhead:${account.email ?? user.email ?? ""}`,
        no_portal_order: true,
      }
    : {
        no_portal_order: false,
        matched_at: null,
        matched_by: null,
      };

  const { error, count } = await service
    .from("mayo_invoice_lines")
    .update(patch, { count: "exact" })
    .in("id", ids)
    .eq("invoice_id", invoiceId);
  if (error) {
    return NextResponse.json(
      { error: `Update failed: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, updated: count ?? 0 });
}
