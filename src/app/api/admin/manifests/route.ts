import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/manifests
 * Admin-only. Creates a new manifest row.
 * Body: { name: string, ship_date: string (YYYY-MM-DD), notes?: string | null }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: accountRow } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();
    const account = accountRow as { role: string } | null;
    if (!account || account.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name: string | undefined = body.name?.trim();
    const shipDate: string | undefined = body.ship_date;
    const notes: string | null = body.notes?.trim() || null;

    if (!name || !shipDate || !/^\d{4}-\d{2}-\d{2}$/.test(shipDate)) {
      return NextResponse.json(
        { error: "Missing or invalid name / ship_date" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    console.log("[manifests:create:server] inserting", { name, shipDate });
    const { data, error } = await service
      .from("manifests")
      .insert({ name, ship_date: shipDate, notes, status: "open" })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[manifests:create:server] insert failed", error);
      return NextResponse.json(
        { error: `Failed to create manifest: ${error?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    console.log(
      "[manifests:create:server] created",
      (data as { id: string }).id
    );
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (err) {
    console.error("[manifests:create]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
