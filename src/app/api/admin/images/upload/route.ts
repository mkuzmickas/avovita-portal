import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
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
 * POST /api/admin/images/upload
 *
 * Admin-only. Issues a signed upload URL for direct browser → Supabase
 * Storage upload of images (covers, product photos).
 *
 * Request body: { filename, fileSize, mimeType, bucket }
 * Response: { signedUrl, token, path }
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { filename, fileSize, mimeType, bucket } = body as {
    filename?: string;
    fileSize?: number;
    mimeType?: string;
    bucket?: string;
  };

  if (!filename) {
    return NextResponse.json(
      { error: "filename is required" },
      { status: 400 },
    );
  }
  if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json(
      { error: `Invalid bucket. Allowed: ${ALLOWED_BUCKETS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, and WebP images are accepted" },
      { status: 400 },
    );
  }
  if (typeof fileSize === "number" && fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit` },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const fileId = crypto.randomUUID();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const storagePath = `${fileId}.${ext}`;

  const { data, error } = await service.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("[images/upload] signed URL error:", error);
    return NextResponse.json(
      { error: `Failed to create upload URL: ${error?.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
  });
}
