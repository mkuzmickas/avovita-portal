import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

const SUPPLEMENT_COLS = `
  id, sku, name, description, price_cad, cost_cad,
  category, brand, active, featured,
  track_inventory, stock_qty, low_stock_threshold,
  image_url, created_at, updated_at
`;

/** GET /api/admin/supplements/[id] */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("supplements")
    .select(SUPPLEMENT_COLS)
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(data);
}

/** PATCH /api/admin/supplements/[id] */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const service = createServiceRoleClient();

  // If SKU changed, check uniqueness against other rows.
  if (body.sku) {
    const { count } = await service
      .from("supplements")
      .select("id", { count: "exact", head: true })
      .eq("sku", body.sku.trim())
      .neq("id", id);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `SKU "${body.sku.trim()}" is already in use` },
        { status: 409 },
      );
    }
  }

  const allowed = [
    "sku",
    "name",
    "description",
    "price_cad",
    "cost_cad",
    "category",
    "brand",
    "active",
    "featured",
    "track_inventory",
    "stock_qty",
    "low_stock_threshold",
    "image_url",
  ] as const;

  const payload: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) payload[key] = body[key];
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 400 },
    );
  }

  const { data, error } = await service
    .from("supplements")
    .update(payload)
    .eq("id", id)
    .select(SUPPLEMENT_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** DELETE /api/admin/supplements/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const service = createServiceRoleClient();

  // Check for order_lines referencing this supplement.
  const { count, error: countError } = await service
    .from("order_lines")
    .select("id", { count: "exact", head: true })
    .eq("supplement_id", id);

  if (countError) {
    return NextResponse.json(
      { error: `Failed to check order history: ${countError.message}` },
      { status: 500 },
    );
  }

  const orderLineCount = count ?? 0;

  if (orderLineCount > 0) {
    // Soft-deactivate — preserve order history integrity.
    await service.from("supplements").update({ active: false }).eq("id", id);
    return NextResponse.json({
      ok: true,
      action: "deactivated",
      orderLineCount,
      message: `This supplement is in ${orderLineCount} past order${orderLineCount !== 1 ? "s" : ""}. It has been deactivated instead of deleted.`,
    });
  }

  const { error: deleteError } = await service
    .from("supplements")
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
