import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/quotes
 * Admin-only. Creates a draft quote with auto-generated quote_number
 * (AVO-YYYY-NNNN) and default 7-day expiry.
 * Body (all optional except returns the created id):
 *   { client_first_name?, client_last_name?, client_email?,
 *     person_count?, collection_city?, notes?, expires_at? }
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

    const body = await request.json().catch(() => ({}));
    const service = createServiceRoleClient();

    // Generate quote_number: AVO-YYYY-NNNN
    const year = new Date().getFullYear();
    const prefix = `AVO-${year}-`;
    const { data: lastRow } = await service
      .from("quotes")
      .select("quote_number")
      .like("quote_number", `${prefix}%`)
      .order("quote_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = lastRow as { quote_number: string } | null;
    let nextSeq = 1;
    if (last) {
      const parsed = parseInt(last.quote_number.slice(prefix.length), 10);
      if (Number.isFinite(parsed)) nextSeq = parsed + 1;
    }
    const quoteNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;

    // Default expires_at: 7 days from now
    const expiresAt =
      typeof body.expires_at === "string" && body.expires_at
        ? body.expires_at
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const insertRow = {
      quote_number: quoteNumber,
      client_first_name: body.client_first_name?.trim() ?? "",
      client_last_name: body.client_last_name?.trim() ?? "",
      client_email: body.client_email?.trim() ?? "",
      person_count: Math.max(1, Math.min(6, Number(body.person_count) || 1)),
      collection_city: body.collection_city?.trim() || null,
      notes: body.notes?.trim() || null,
      status: "draft" as const,
      subtotal_cad: 0,
      discount_cad: 0,
      visit_fee_cad: 0,
      total_cad: 0,
      sent_at: null,
      expires_at: expiresAt,
      created_by: user.id,
    };

    const { data, error } = await service
      .from("quotes")
      .insert(insertRow)
      .select("id, quote_number")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: `Failed to create quote: ${error?.message ?? "unknown"}` },
        { status: 500 }
      );
    }
    return NextResponse.json({
      id: (data as { id: string }).id,
      quote_number: (data as { quote_number: string }).quote_number,
    });
  } catch (err) {
    console.error("[quotes:create]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
