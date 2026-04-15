import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/checkout/validate-promo
 *
 * Body: { code: string }
 *
 * Validates any active customer-facing Stripe Promotion Code.
 * Returns the promotion code id (`promo_xxx`) — NOT the underlying
 * coupon id — so the checkout session can reference it via
 * `discounts: [{ promotion_code: id }]`. Also returns the discount
 * shape so the UI can show an accurate "−$X" line before redirecting
 * to Stripe.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code: string | undefined = body.code?.trim();
    if (!code) {
      return NextResponse.json(
        { error: "Promo code is required" },
        { status: 400 }
      );
    }

    // Stripe Promotion Code lookup is case-sensitive. The dashboard
    // accepts whatever casing was created — pass the user's value as-is
    // (we still uppercase for the eventual metadata log).
    const list = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });
    const promo = list.data[0] as
      | (typeof list.data[0] & {
          coupon?: {
            valid: boolean;
            percent_off: number | null;
            amount_off: number | null;
            currency: string | null;
            name: string | null;
          };
        })
      | undefined;
    if (!promo) {
      return NextResponse.json(
        { error: "That promo code isn't valid." },
        { status: 404 }
      );
    }
    if (!promo.coupon || !promo.coupon.valid) {
      return NextResponse.json(
        { error: "That promo code is no longer active." },
        { status: 410 }
      );
    }

    return NextResponse.json({
      id: promo.id,
      code: promo.code,
      percent_off: promo.coupon.percent_off ?? null,
      amount_off: promo.coupon.amount_off ?? null,
      currency: promo.coupon.currency ?? null,
      name: promo.coupon.name ?? null,
    });
  } catch (err) {
    console.error("[validate-promo] error:", err);
    return NextResponse.json(
      { error: "Failed to validate promo code" },
      { status: 500 }
    );
  }
}
