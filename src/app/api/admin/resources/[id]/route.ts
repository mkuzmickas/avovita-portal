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

/** GET /api/admin/resources/[id] */
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
    .from("resources")
    .select(RESOURCE_COLS)
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

/** PATCH /api/admin/resources/[id] */
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

  const allowed = [
    "title",
    "description",
    "price_cad",
    "file_path",
    "file_size_bytes",
    "file_type",
    "page_count",
    "cover_image_url",
    "active",
    "featured",
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
    .from("resources")
    .update(payload)
    .eq("id", id)
    .select(RESOURCE_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** DELETE /api/admin/resources/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const service = createServiceRoleClient();

  // Check for purchases.
  const { count } = await service
    .from("resource_purchases")
    .select("id", { count: "exact", head: true })
    .eq("resource_id", id);

  const purchaseCount = count ?? 0;

  if (purchaseCount > 0) {
    await service.from("resources").update({ active: false }).eq("id", id);
    return NextResponse.json({
      ok: true,
      action: "deactivated",
      purchaseCount,
      message: `This resource has been purchased ${purchaseCount} time${purchaseCount !== 1 ? "s" : ""}. It has been deactivated instead. Existing download links will continue to work until they expire.`,
    });
  }

  // No purchases — safe to hard-delete. Also delete the storage file.
  const { data: resource } = await service
    .from("resources")
    .select("file_path")
    .eq("id", id)
    .single();

  if (resource && (resource as { file_path: string }).file_path) {
    await service.storage
      .from("resources")
      .remove([(resource as { file_path: string }).file_path]);
  }

  const { error: deleteError } = await service
    .from("resources")
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
