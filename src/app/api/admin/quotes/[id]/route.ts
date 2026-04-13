import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { computeQuoteTotals } from "@/lib/quotes/totals";

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
 * PATCH /api/admin/quotes/[id]
 * Updates editable fields. If person_count changes, totals are recomputed
 * from current lines.
 * Body subset: { client_first_name, client_last_name, client_email,
 *   person_count, collection_city, notes, expires_at, status }
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
    if (typeof body.client_first_name === "string") {
      update.client_first_name = body.client_first_name.trim();
    }
    if (typeof body.client_last_name === "string") {
      update.client_last_name = body.client_last_name.trim();
    }
    if (typeof body.client_email === "string") {
      update.client_email = body.client_email.trim();
    }
    if ("person_count" in body) {
      const n = Math.max(1, Math.min(6, Number(body.person_count) || 1));
      update.person_count = n;
    }
    if ("collection_city" in body) {
      update.collection_city =
        typeof body.collection_city === "string" && body.collection_city.trim()
          ? body.collection_city.trim()
          : null;
    }
    if ("notes" in body) {
      update.notes =
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null;
    }
    if (typeof body.expires_at === "string" && body.expires_at) {
      update.expires_at = body.expires_at;
    }
    if (
      typeof body.status === "string" &&
      ["draft", "sent", "accepted", "expired"].includes(body.status)
    ) {
      update.status = body.status;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const service = createServiceRoleClient();

    // If person_count is changing, recompute totals from existing lines
    if ("person_count" in update) {
      const { data: linesRaw } = await service
        .from("quote_lines")
        .select("unit_price_cad")
        .eq("quote_id", id);
      const lines = (linesRaw ?? []) as unknown as { unit_price_cad: number }[];
      const totals = computeQuoteTotals(lines, update.person_count as number);
      Object.assign(update, totals);
    }

    const { error } = await service
      .from("quotes")
      .update(update)
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to update quote: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[quotes:patch]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/quotes/[id] — hard delete (cascades quote_lines via FK).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await adminGuard();
    if ("error" in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { id } = await params;
    const service = createServiceRoleClient();
    const { error } = await service.from("quotes").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete quote: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[quotes:delete]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
