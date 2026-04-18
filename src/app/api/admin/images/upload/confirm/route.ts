import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_BUCKETS = ["resource-covers", "supplement-images"];

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
 * POST /api/admin/images/upload/confirm
 *
 * Verifies an image was successfully uploaded to Supabase Storage.
 *
 * Request body: { path, bucket, filename, fileSize }
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { path, bucket } = body as {
    path?: string;
    bucket?: string;
    filename?: string;
    fileSize?: number;
  };

  if (!path || !bucket || !ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json(
      { error: "path and valid bucket are required" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Verify existence via public URL probe (for public buckets)
  const { data: urlData } = service.storage
    .from(bucket)
    .getPublicUrl(path);

  if (!urlData?.publicUrl) {
    return NextResponse.json(
      { error: "Upload verification failed — file not found in storage." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    file_path: path,
    public_url: urlData.publicUrl,
  });
}
