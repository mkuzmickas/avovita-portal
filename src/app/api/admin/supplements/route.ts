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

/** GET /api/admin/supplements — list all supplements (admin only). */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("supplements")
    .select(SUPPLEMENT_COLS)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/admin/supplements — create a new supplement (admin only). */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { sku, name, price_cad } = body as {
    sku?: string;
    name?: string;
    price_cad?: number;
  };

  if (!sku?.trim()) {
    return NextResponse.json({ error: "SKU is required" }, { status: 400 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (price_cad == null || isNaN(Number(price_cad))) {
    return NextResponse.json({ error: "Price is required" }, { status: 400 });
  }

  const service = createServiceRoleClient();

  // Check SKU uniqueness.
  const { count } = await service
    .from("supplements")
    .select("id", { count: "exact", head: true })
    .eq("sku", sku.trim());
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `SKU "${sku.trim()}" is already in use` },
      { status: 409 },
    );
  }

  const payload = {
    sku: sku.trim(),
    name: name.trim(),
    description: body.description || null,
    price_cad: Number(price_cad),
    cost_cad: body.cost_cad != null ? Number(body.cost_cad) : null,
    category: body.category || null,
    brand: body.brand || null,
    active: body.active ?? true,
    featured: body.featured ?? false,
    track_inventory: body.track_inventory ?? false,
    stock_qty: body.stock_qty ?? 0,
    low_stock_threshold: body.low_stock_threshold ?? 5,
    image_url: body.image_url || null,
  };

  const { data, error } = await service
    .from("supplements")
    .insert(payload)
    .select(SUPPLEMENT_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
