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
 * PATCH /api/admin/manifests/[id]
 * Admin-only. Updates a manifest's status, name, ship_date, or notes.
 * Body: any subset of { status, name, ship_date, notes }
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
    if (body.status === "open" || body.status === "closed") {
      update.status = body.status;
    }
    if (typeof body.name === "string" && body.name.trim()) {
      update.name = body.name.trim();
    }
    if (
      typeof body.ship_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.ship_date)
    ) {
      update.ship_date = body.ship_date;
    }
    if ("notes" in body) {
      update.notes =
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const { error } = await service
      .from("manifests")
      .update(update)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update manifest: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[manifests:patch]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
