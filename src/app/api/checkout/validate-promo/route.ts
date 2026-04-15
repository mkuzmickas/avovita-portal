import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrgIdBySlug } from "@/lib/org";

export const runtime = "nodejs";

/**
 * POST /api/checkout/validate-promo
 *
 * Body: { code: string; orgSlug?: string | null }
 *
 * Looks up the code in public.promo_codes (case-insensitive), checks
 * active / expiry / redemption cap, enforces org affinity if set, and
 * returns the Stripe promotion_code id the checkout session will
 * attach. No Stripe API call at validation time.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code: string | undefined = body.code?.trim();
    const orgSlug: string | null =
      typeof body.orgSlug === "string" && body.orgSlug.trim()
        ? body.orgSlug.trim()
        : null;

    if (!code) {
      return NextResponse.json(
        { error: "Promo code is required" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    const { data: rowRaw, error } = await service
      .from("promo_codes")
      .select(
        "id, code, description, percent_off, amount_off, currency, active, stripe_promo_id, stripe_coupon_id, org_id, max_redemptions, times_redeemed, expires_at"
      )
      .ilike("code", code)
      .maybeSingle();

    if (error) {
      console.error("[validate-promo] lookup error:", error.message);
      return NextResponse.json(
        { error: "Failed to validate promo code" },
        { status: 500 }
      );
    }

    type Row = {
      id: string;
      code: string;
      description: string | null;
      percent_off: number | null;
      amount_off: number | null;
      currency: string | null;
      active: boolean;
      stripe_promo_id: string | null;
      stripe_coupon_id: string | null;
      org_id: string | null;
      max_redemptions: number | null;
      times_redeemed: number | null;
      expires_at: string | null;
    };
    const row = rowRaw as Row | null;

    if (!row || !row.active) {
      return NextResponse.json(
        { error: "Invalid or expired promo code" },
        { status: 400 }
      );
    }

    // Expiry
    if (row.expires_at && new Date(row.expires_at) <= new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired promo code" },
        { status: 400 }
      );
    }

    // Redemption cap
    if (
      row.max_redemptions !== null &&
      (row.times_redeemed ?? 0) >= row.max_redemptions
    ) {
      return NextResponse.json(
        { error: "This promo code has reached its redemption limit." },
        { status: 400 }
      );
    }

    // Org affinity — when the code is tied to an org, the current
    // checkout must be flowing through that same org's /org/[slug]/*.
    if (row.org_id) {
      const currentOrgId = orgSlug ? await getOrgIdBySlug(orgSlug) : null;
      if (currentOrgId !== row.org_id) {
        return NextResponse.json(
          { error: "This code is not valid for this store." },
          { status: 400 }
        );
      }
    }

    // Increment times_redeemed (best-effort, non-blocking for success).
    try {
      await service
        .from("promo_codes")
        .update({ times_redeemed: (row.times_redeemed ?? 0) + 1 })
        .eq("id", row.id);
    } catch (incErr) {
      console.warn(
        "[validate-promo] times_redeemed bump failed (non-fatal):",
        incErr
      );
    }

    return NextResponse.json({
      valid: true,
      promoId: row.stripe_promo_id,
      code: row.code,
      description: row.description,
      percentOff: row.percent_off ?? 0,
      amountOff:
        // Column is DECIMAL in CAD dollars; calculateTotals expects
        // cents to match Stripe's amount_off convention, so convert.
        row.amount_off !== null ? Math.round(Number(row.amount_off) * 100) : 0,
      currency: row.currency ?? "cad",
    });
  } catch (err) {
    console.error("[validate-promo] error:", err);
    return NextResponse.json(
      { error: "Failed to validate promo code" },
      { status: 500 }
    );
  }
}
