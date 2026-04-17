import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";

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
 * Admin-only. Uploads a PDF to the "resources" Supabase Storage bucket.
 * Returns: file_path, file_size_bytes, page_count (best-effort).
 *
 * Multipart form field: file (required, application/pdf, max 50MB)
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are accepted" },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit` },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const fileBuffer = await file.arrayBuffer();

  // Generate unique storage path.
  const fileId = crypto.randomUUID();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
  const storagePath = `${fileId}.${ext}`;

  const { error: uploadError } = await service.storage
    .from("resources")
    .upload(storagePath, fileBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("[resources/upload] storage error:", uploadError);
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // Best-effort page count extraction using pdf-lib.
  let pageCount: number | null = null;
  try {
    const pdf = await PDFDocument.load(fileBuffer, {
      ignoreEncryption: true,
    });
    pageCount = pdf.getPageCount();
  } catch {
    // Non-fatal — pageCount stays null.
  }

  return NextResponse.json({
    file_path: storagePath,
    file_size_bytes: file.size,
    file_type: "application/pdf",
    page_count: pageCount,
    original_name: file.name,
  });
}
