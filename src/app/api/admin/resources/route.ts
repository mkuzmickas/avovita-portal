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

const RESOURCE_COLS = `
  id, title, description, price_cad, file_path,
  file_size_bytes, file_type, page_count,
  cover_image_url, active, featured, download_count,
  created_at, updated_at
`;

/** GET /api/admin/resources — list all resources (admin only). */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("resources")
    .select(RESOURCE_COLS)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/admin/resources — create a new resource (admin only). */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { title, file_path } = body as {
    title?: string;
    file_path?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!file_path?.trim()) {
    return NextResponse.json(
      { error: "A PDF file must be uploaded" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const payload = {
    title: title.trim(),
    description: body.description || null,
    price_cad: body.price_cad != null ? Number(body.price_cad) : 0,
    file_path: file_path.trim(),
    file_size_bytes: body.file_size_bytes ?? null,
    file_type: body.file_type || "application/pdf",
    page_count: body.page_count ?? null,
    cover_image_url: body.cover_image_url || null,
    active: body.active ?? true,
    featured: body.featured ?? false,
  };

  const { data, error } = await service
    .from("resources")
    .insert(payload)
    .select(RESOURCE_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
