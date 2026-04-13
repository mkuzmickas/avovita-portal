import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export const VALID_CATEGORIES = [
  "software",
  "utilities",
  "supplies",
  "labour",
  "shipping",
  "marketing",
  "other",
] as const;

export const VALID_FREQUENCIES = ["monthly", "annual", "one_time"] as const;

/**
 * POST /api/admin/expenses
 * Admin-only. Creates a recurring expense.
 * Body: { name, amount_cad, category, frequency, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: accountRow } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();
    const account = accountRow as { role: string } | null;
    if (!account || account.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name: string | undefined = body.name?.trim();
    const amount = Number(body.amount_cad);
    const category: string | undefined = body.category;
    const frequency: string | undefined = body.frequency;
    const notes: string | null = body.notes?.trim() || null;

    if (!name || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json(
        { error: "name and a non-negative amount_cad are required" },
        { status: 400 }
      );
    }
    if (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      return NextResponse.json(
        { error: `category must be one of ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!frequency || !VALID_FREQUENCIES.includes(frequency as (typeof VALID_FREQUENCIES)[number])) {
      return NextResponse.json(
        { error: `frequency must be one of ${VALID_FREQUENCIES.join(", ")}` },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("expenses")
      .insert({
        name,
        amount_cad: amount,
        category,
        frequency,
        notes,
        active: true,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: `Failed to create expense: ${error?.message ?? "unknown"}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (err) {
    console.error("[expenses:create]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
