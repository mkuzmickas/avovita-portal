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

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("promo_codes")
    .insert({
      code: String(body.code).trim(),
      description: body.description ?? null,
      percent_off: body.percent_off ?? 0,
      amount_off: body.amount_off ?? 0,
      currency: body.currency ?? "cad",
      active: body.active ?? true,
      stripe_promo_id: body.stripe_promo_id ?? null,
      stripe_coupon_id: body.stripe_coupon_id ?? null,
      org_id: body.org_id ?? null,
      max_redemptions: body.max_redemptions ?? null,
      expires_at: body.expires_at ?? null,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: (data as { id: string }).id });
}
