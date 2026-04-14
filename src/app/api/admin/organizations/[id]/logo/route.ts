import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

async function adminGuard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  const { data: accountRow } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const account = accountRow as { role: string } | null;
  if (!account || account.role !== "admin") {
    return { error: "Forbidden — admin only", status: 403 as const };
  }
  return { ok: true as const };
}

/**
 * POST /api/admin/organizations/[id]/logo
 * Multipart upload — `file` field. Stored at `org-logos/<slug>/logo.<ext>`
 * in the public `org-logos` bucket. Updates organizations.logo_url.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await adminGuard();
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { id } = await params;
    const service = createServiceRoleClient();

    const { data: orgRow } = await service
      .from("organizations")
      .select("id, slug, logo_url")
      .eq("id", id)
      .maybeSingle();
    const org = orgRow as { id: string; slug: string; logo_url: string | null } | null;
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Logo must be PNG, JPEG, WebP, or SVG" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Logo exceeds 2 MB (${Math.round(file.size / 1024 / 1024)} MB)` },
        { status: 400 }
      );
    }

    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/jpeg"
          ? "jpg"
          : file.type === "image/webp"
            ? "webp"
            : "svg";
    const storagePath = `${org.slug}/logo.${ext}`;
    const buffer = await file.arrayBuffer();

    const { error: uploadErr } = await service.storage
      .from("org-logos")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });
    if (uploadErr) {
      console.error("[org-logo:upload] storage error", uploadErr);
      return NextResponse.json(
        { error: `Upload failed: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = service.storage
      .from("org-logos")
      .getPublicUrl(storagePath);
    // Cache-bust so the new logo shows immediately
    const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: updateErr } = await service
      .from("organizations")
      .update({ logo_url: logoUrl })
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json(
        { error: `Saved file but couldn't update record: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, logo_url: logoUrl });
  } catch (err) {
    console.error("[admin:organizations:logo:upload]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
