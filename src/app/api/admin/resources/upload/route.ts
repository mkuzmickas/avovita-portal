import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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
 * POST /api/admin/resources/upload
 *
 * Admin-only. Issues a signed upload URL for direct browser → Supabase
 * Storage upload. No file bytes pass through Vercel — avoids the
 * ~4.5 MB serverless function body limit.
 *
 * Request body (JSON): { filename, fileSize, mimeType }
 * Response: { signedUrl, token, path }
 *
 * After the browser uploads directly to signedUrl, the client calls
 * /api/admin/resources/upload/confirm to verify and finalise.
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { filename, fileSize, mimeType } = body as {
    filename?: string;
    fileSize?: number;
    mimeType?: string;
  };

  if (!filename) {
    return NextResponse.json(
      { error: "filename is required" },
      { status: 400 },
    );
  }
  if (mimeType !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are accepted" },
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

  // Generate unique storage path
  const fileId = crypto.randomUUID();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "pdf";
  const storagePath = `${fileId}.${ext}`;

  // Create a signed upload URL (valid for 2 minutes)
  const { data, error } = await service.storage
    .from("resources")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("[resources/upload] signed URL error:", error);
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
