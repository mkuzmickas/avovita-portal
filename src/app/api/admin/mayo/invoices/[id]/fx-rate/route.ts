import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/mayo/invoices/[id]/fx-rate
 *
 * Body: { fx_rate: number }
 *
 * Overrides the USD → CAD conversion rate for one Mayo invoice.
 * All CAD figures in the matcher and the financials view are derived
 * from `charge_usd * fx_rate` at read time, so a save here retro-
 * actively updates every dollar figure for the invoice's lines.
 *
 * Guardrails: 0.5 ≤ rate ≤ 3.0 (CAD has never traded outside this
 * band; anything outside is almost certainly a typo).
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
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id: invoiceId } = await params;

  let body: { fx_rate?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const rate = Number(body.fx_rate);
  if (!Number.isFinite(rate) || rate < 0.5 || rate > 3.0) {
    return NextResponse.json(
      { error: "fx_rate must be between 0.5 and 3.0." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("mayo_invoices")
    .update({ fx_rate: rate })
    .eq("id", invoiceId);
  if (error) {
    return NextResponse.json(
      { error: `Update failed: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, fx_rate: rate });
}
