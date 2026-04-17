import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/resources — public endpoint returning active resources.
 * No auth required. Returns metadata only (no file_path).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter"); // all | free | paid
  const search = searchParams.get("search");
  const sort = searchParams.get("sort"); // featured | price_asc | price_desc

  const supabase = createServiceRoleClient();

  let query = supabase
    .from("resources")
    .select(
      "id, title, description, price_cad, cover_image_url, page_count, file_size_bytes, featured",
    )
    .eq("active", true);

  if (filter === "free") query = query.eq("price_cad", 0);
  if (filter === "paid") query = query.gt("price_cad", 0);
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%`,
    );
  }

  if (sort === "price_asc") {
    query = query.order("price_cad", { ascending: true });
  } else if (sort === "price_desc") {
    query = query.order("price_cad", { ascending: false });
  } else {
    query = query
      .order("featured", { ascending: false })
      .order("title", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
