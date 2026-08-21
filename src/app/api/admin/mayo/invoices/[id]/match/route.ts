import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { backstampMayoIds } from "@/app/api/admin/mayo/invoices/route";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/mayo/invoices/[id]/match
 *
 * Body: { line_id: string, order_id: string | null }
 *
 * `order_id: null` clears the match (drag-off / undo). Otherwise
 * stamps the order_id + matched_at + matched_by='manual:<email>'.
 * We do not verify the order exists — the FK on mayo_invoice_lines
 * enforces that; if the id is bogus the DB rejects the update.
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

  let body: { line_id?: string; order_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.line_id) {
    return NextResponse.json({ error: "line_id required." }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const update = body.order_id
    ? {
        order_id: body.order_id,
        matched_at: new Date().toISOString(),
        matched_by: `manual:${account.email ?? user.email ?? ""}`,
      }
    : {
        order_id: null,
        matched_at: null,
        matched_by: null,
      };

  const { error } = await service
    .from("mayo_invoice_lines")
    .update(update)
    .eq("id", body.line_id)
    .eq("invoice_id", invoiceId);

  if (error) {
    return NextResponse.json(
      { error: `Match failed: ${error.message}` },
      { status: 500 },
    );
  }

  // Learning loop — if this was a MATCH (not an unmatch), back-stamp
  // Mayo's identifiers onto the order + patient profile so future
  // invoices auto-match this patient via the deterministic PK path.
  if (body.order_id) {
    const { data: line } = await service
      .from("mayo_invoice_lines")
      .select("accession_no, specimen_no, mayo_patient_id")
      .eq("id", body.line_id)
      .maybeSingle();
    if (line) {
      const l = line as unknown as {
        accession_no: string;
        specimen_no: string | null;
        mayo_patient_id: string | null;
      };
      await backstampMayoIds(service, body.order_id, {
        accession_no: l.accession_no,
        specimen_no: l.specimen_no,
        mayo_patient_id: l.mayo_patient_id,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
