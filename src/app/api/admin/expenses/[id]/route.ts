import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { VALID_CATEGORIES, VALID_FREQUENCIES } from "../route";

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
 * PATCH /api/admin/expenses/[id]
 * Updates any subset of { name, amount_cad, category, frequency, active, notes }.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await adminGuard();
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { id } = await params;
    const body = await request.json();

    const update: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      update.name = body.name.trim();
    }
    if ("amount_cad" in body) {
      const amount = Number(body.amount_cad);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json(
          { error: "amount_cad must be a non-negative number" },
          { status: 400 }
        );
      }
      update.amount_cad = amount;
    }
    if (
      typeof body.category === "string" &&
      VALID_CATEGORIES.includes(body.category as (typeof VALID_CATEGORIES)[number])
    ) {
      update.category = body.category;
    }
    if (
      typeof body.frequency === "string" &&
      VALID_FREQUENCIES.includes(body.frequency as (typeof VALID_FREQUENCIES)[number])
    ) {
      update.frequency = body.frequency;
    }
    if (typeof body.active === "boolean") {
      update.active = body.active;
    }
    if ("notes" in body) {
      update.notes =
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const { error } = await service
      .from("expenses")
      .update(update)
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to update expense: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[expenses:patch]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/expenses/[id] — hard delete.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await adminGuard();
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { id } = await params;
    const service = createServiceRoleClient();
    const { error } = await service.from("expenses").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete expense: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[expenses:delete]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
