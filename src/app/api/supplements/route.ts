import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/supplements — public endpoint returning active supplements.
 * No auth required. Supports optional query params for filtering/sorting.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand");
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const sort = searchParams.get("sort"); // featured | price_asc | price_desc

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("supplements")
    .select(
      "id, sku, name, brand, category, description, price_cad, image_url, featured, track_inventory, stock_qty",
    )
    .eq("active", true);

  if (brand) query = query.eq("brand", brand);
  if (category) query = query.eq("category", category);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,brand.ilike.%${search}%,category.ilike.%${search}%`,
    );
  }

  if (sort === "price_asc") {
    query = query.order("price_cad", { ascending: true });
  } else if (sort === "price_desc") {
    query = query.order("price_cad", { ascending: false });
  } else {
    query = query
      .order("featured", { ascending: false })
      .order("name", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
