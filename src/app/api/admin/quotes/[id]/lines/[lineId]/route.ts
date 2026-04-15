import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { computeQuoteTotals } from "@/lib/quotes/totals";

export const runtime = "nodejs";

async function adminGuard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  const { data: accountRow } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const account = accountRow as { role: string } | null;
  if (!account || account.role !== "admin") {
    return { error: "Forbidden — admin only", status: 403 as const };
  }
  return { ok: true as const };
}

/**
 * DELETE /api/admin/quotes/[id]/lines/[lineId]
 * Removes a line and recomputes quote totals.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const guard = await adminGuard();
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { id: quoteId, lineId } = await params;
    const service = createServiceRoleClient();

    const { error } = await service
      .from("quote_lines")
      .delete()
      .eq("id", lineId)
      .eq("quote_id", quoteId);
    if (error) {
      return NextResponse.json(
        { error: `Failed to remove line: ${error.message}` },
        { status: 500 }
      );
    }

    // Recompute totals
    const [{ data: quoteRaw }, { data: linesRaw }] = await Promise.all([
      service
        .from("quotes")
        .select("person_count, manual_discount_value, manual_discount_type")
        .eq("id", quoteId)
        .maybeSingle(),
      service.from("quote_lines").select("unit_price_cad").eq("quote_id", quoteId),
    ]);
    const quote = quoteRaw as {
      person_count: number;
      manual_discount_value: number | null;
      manual_discount_type: "amount" | "percent" | null;
    } | null;
    const lines = (linesRaw ?? []) as unknown as { unit_price_cad: number }[];
    if (quote) {
      const totals = computeQuoteTotals(lines, quote.person_count, {
        value: quote.manual_discount_value ?? 0,
        type: quote.manual_discount_type ?? "amount",
      });
      await service.from("quotes").update(totals).eq("id", quoteId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[quotes:delete-line]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
