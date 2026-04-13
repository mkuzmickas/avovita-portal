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

async function recomputeAndUpdate(
  service: ReturnType<typeof createServiceRoleClient>,
  quoteId: string
) {
  const [{ data: quoteRaw }, { data: linesRaw }] = await Promise.all([
    service.from("quotes").select("person_count").eq("id", quoteId).maybeSingle(),
    service.from("quote_lines").select("unit_price_cad").eq("quote_id", quoteId),
  ]);
  const quote = quoteRaw as { person_count: number } | null;
  const lines = (linesRaw ?? []) as unknown as { unit_price_cad: number }[];
  if (!quote) return;
  const totals = computeQuoteTotals(lines, quote.person_count);
  await service.from("quotes").update(totals).eq("id", quoteId);
}

/**
 * POST /api/admin/quotes/[id]/lines
 * Adds a quote line by test_id. Snapshots the test's current price into
 * unit_price_cad. Recomputes quote totals.
 * Body: { test_id: string, person_label?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await adminGuard();
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { id: quoteId } = await params;
    const body = await request.json();
    const testId: string | undefined = body.test_id;
    const personLabel: string | null =
      typeof body.person_label === "string" && body.person_label.trim()
        ? body.person_label.trim()
        : null;

    if (!testId) {
      return NextResponse.json({ error: "test_id required" }, { status: 400 });
    }

    const service = createServiceRoleClient();

    const { data: testRow } = await service
      .from("tests")
      .select("price_cad, active")
      .eq("id", testId)
      .maybeSingle();
    const test = testRow as { price_cad: number | null; active: boolean } | null;
    if (!test) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }
    if (test.price_cad == null) {
      return NextResponse.json(
        { error: "Test has no price set; cannot add to quote" },
        { status: 400 }
      );
    }

    const { data: insertedRaw, error } = await service
      .from("quote_lines")
      .insert({
        quote_id: quoteId,
        test_id: testId,
        person_label: personLabel,
        unit_price_cad: test.price_cad,
        discount_applied: 0,
      })
      .select("id")
      .single();
    if (error || !insertedRaw) {
      return NextResponse.json(
        { error: `Failed to add line: ${error?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    await recomputeAndUpdate(service, quoteId);

    return NextResponse.json({ id: (insertedRaw as { id: string }).id });
  } catch (err) {
    console.error("[quotes:add-line]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
