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
 * PATCH /api/admin/organizations/[id]
 * Update editable org fields.
 * Body subset: { name, slug, primary_color, accent_color, contact_email, active }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await adminGuard();
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { id } = await params;
    const body = await request.json();

    const update: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      update.name = body.name.trim();
    }
    if (typeof body.slug === "string" && body.slug.trim()) {
      const slug = body.slug.trim();
      if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
        return NextResponse.json(
          { error: "slug may only contain letters, numbers, hyphens, underscores" },
          { status: 400 }
        );
      }
      update.slug = slug;
    }
    if (typeof body.primary_color === "string") {
      update.primary_color = body.primary_color.trim();
    }
    if (typeof body.accent_color === "string") {
      update.accent_color = body.accent_color.trim();
    }
    if ("contact_email" in body) {
      update.contact_email =
        typeof body.contact_email === "string" && body.contact_email.trim()
          ? body.contact_email.trim()
          : null;
    }
    if (typeof body.active === "boolean") {
      update.active = body.active;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const { error } = await service
      .from("organizations")
      .update(update)
      .eq("id", id);
    if (error) {
      const message = error.message.includes("duplicate")
        ? "Slug already in use — pick another"
        : `Failed to update: ${error.message}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin:organizations:patch]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
