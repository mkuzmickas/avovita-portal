import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Admin-only guard matching the pattern used across other /api/admin
 * routes (see promo-codes/[id]/route.ts). Returns the authenticated
 * admin user, or null if the caller is not an admin.
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: acc } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!acc || (acc as { role: string }).role !== "admin") return null;
  return user;
}

/**
 * DELETE /api/admin/tests/[id]
 *
 * Smart delete: if the test has any order_lines referencing it, the
 * test cannot be permanently removed (order history integrity), so we
 * soft-deactivate instead. Otherwise we hard-delete from the tests
 * table. The response `action` field tells the client which path ran.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing test id" }, { status: 400 });
  }

  const service = createServiceRoleClient();

  // Check for any order_lines referencing this test. We use head+count
  // for a cheap existence check rather than pulling rows.
  const { count, error: countError } = await service
    .from("order_lines")
    .select("id", { count: "exact", head: true })
    .eq("test_id", id);

  if (countError) {
    return NextResponse.json(
      { error: `Failed to check order history: ${countError.message}` },
      { status: 500 },
    );
  }

  const orderLineCount = count ?? 0;

  if (orderLineCount > 0) {
    // Has order history → deactivate instead of deleting.
    const { error: updateError } = await service
      .from("tests")
      .update({ active: false })
      .eq("id", id);
    if (updateError) {
      return NextResponse.json(
        { error: `Failed to deactivate: ${updateError.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      action: "deactivated",
      reason: "has_orders",
      orderLineCount,
      message:
        "This test has existing orders and cannot be deleted. It has been deactivated instead.",
    });
  }

  // No order history → safe to hard-delete.
  const { error: deleteError } = await service
    .from("tests")
    .delete()
    .eq("id", id);
  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to delete: ${deleteError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, action: "deleted" });
}

/**
 * PATCH /api/admin/tests/[id]
 *
 * Generic partial update. Currently only used by the client to perform
 * the "Deactivate instead" action from the delete confirmation dialog,
 * so we restrict the accepted fields to `active` for safety. If other
 * fields need server-side updates later, add them to ALLOWED_FIELDS.
 */
const ALLOWED_FIELDS = ["active"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing test id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const payload: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) payload[key] = body[key];
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { error } = await service.from("tests").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: `Failed to update: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, updated: payload });
}
