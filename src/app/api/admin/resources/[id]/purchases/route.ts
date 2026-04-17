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

/** GET /api/admin/resources/[id]/purchases — list purchases for a resource. */
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
    .from("resource_purchases")
    .select(
      "id, email, download_count, max_downloads, expires_at, created_at",
    )
    .eq("resource_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
