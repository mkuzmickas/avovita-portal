import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/expense-categories
 *
 * Map an uncategorized supplier to a category. Idempotent — if a row
 * already exists for the supplier pattern, we update its category.
 * After the mapping is saved, we retroactively update all existing
 * qbo_transactions with the same supplier_name so they reflect the
 * new bucket immediately.
 *
 * Body: { supplier_pattern: string, category: string, is_cogs: boolean }
 */

const VALID_CATEGORIES = new Set([
  "cogs_lab",
  "cogs_shipping",
  "cogs_supplies",
  "contractor",
  "saas",
  "marketing",
  "regulatory",
  "bank_fees",
  "travel",
  "inventory",
  "other",
]);

export async function POST(request: NextRequest) {
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

  let body: {
    supplier_pattern?: string;
    category?: string;
    is_cogs?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const pattern = body.supplier_pattern?.trim();
  const category = body.category?.trim();
  const isCogs = body.is_cogs === true;
  if (!pattern || !category) {
    return NextResponse.json(
      { error: "supplier_pattern and category required." },
      { status: 400 },
    );
  }
  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json(
      { error: `Unknown category: ${category}` },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  const { error: upsertErr } = await service
    .from("expense_categories")
    .upsert(
      { supplier_pattern: pattern, category, is_cogs: isCogs },
      { onConflict: "supplier_pattern" },
    );
  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to save mapping: ${upsertErr.message}` },
      { status: 500 },
    );
  }

  // Retroactive backfill — same rule as sync-time resolution:
  // supplier_name ILIKE %pattern%.
  const { error: backfillErr, count } = await service
    .from("qbo_transactions")
    .update({ category }, { count: "exact" })
    .ilike("supplier_name", `%${pattern}%`)
    .is("category", null);
  if (backfillErr) {
    return NextResponse.json(
      {
        error: `Mapping saved but backfill failed: ${backfillErr.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, updated: count ?? 0 });
}
