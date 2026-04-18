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

/**
 * POST /api/admin/resources/upload/confirm
 *
 * Admin-only. Called after the browser finishes uploading directly
 * to Supabase Storage. Verifies the file exists at the given path
 * and returns the finalised file_path for the resources row.
 *
 * Request body (JSON): { path, filename, fileSize }
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { path, filename, fileSize } = body as {
    path?: string;
    filename?: string;
    fileSize?: number;
  };

  if (!path) {
    return NextResponse.json(
      { error: "path is required" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Defensive check: verify the file actually exists in Storage
  const { data: fileData, error: fileErr } = await service.storage
    .from("resources")
    .createSignedUrl(path, 5); // 5-second URL just to verify existence

  if (fileErr || !fileData?.signedUrl) {
    return NextResponse.json(
      {
        error:
          "Upload verification failed — file not found in storage. Please try uploading again.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    file_path: path,
    file_size_bytes: fileSize ?? null,
    file_type: "application/pdf",
    original_name: filename ?? null,
  });
}
