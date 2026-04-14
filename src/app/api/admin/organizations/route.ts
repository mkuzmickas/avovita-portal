import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
 * POST /api/admin/organizations
 * Create a new white-label organization.
 * Body: { name, slug, primary_color?, accent_color?, contact_email? }
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await adminGuard();
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json();
    const name: string | undefined = body.name?.trim();
    const slug: string | undefined = body.slug?.trim();
    const primary: string = body.primary_color?.trim() || "#2d6b35";
    const accent: string = body.accent_color?.trim() || "#c4973a";
    const email: string | null = body.contact_email?.trim() || null;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "name and slug are required" },
        { status: 400 }
      );
    }
    if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
      return NextResponse.json(
        { error: "slug may only contain letters, numbers, hyphens, underscores" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("organizations")
      .insert({
        name,
        slug,
        primary_color: primary,
        accent_color: accent,
        contact_email: email,
        active: true,
      })
      .select("id")
      .single();

    if (error || !data) {
      const message = error?.message?.includes("duplicate")
        ? "Slug already in use — pick another"
        : `Failed to create organization: ${error?.message ?? "unknown"}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (err) {
    console.error("[admin:organizations:create]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
