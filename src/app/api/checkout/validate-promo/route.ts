import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/checkout/validate-promo
 *
 * Body: { code: string }
 *
 * Validates a customer-facing Stripe Promotion Code. Returns the
 * promotion code id (`promo_xxx`) — NOT the underlying coupon id —
 * so the checkout session can reference it via
 * `discounts: [{ promotion_code: id }]`.
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
        { error: "Invalid or expired promo code" },
        { status: 400 }
      );
    }

    const percentOff = promo.coupon?.percent_off ?? 0;
    const amountOff = promo.coupon?.amount_off ?? 0;

    console.log(
      `[validate-promo] promoId=${promo.id} code="${promo.code}" percentOff=${percentOff} amountOff=${amountOff}`
    );

    return NextResponse.json({
      valid: true,
      promoId: promo.id,
      code: promo.code,
      percentOff,
      amountOff,
      currency: promo.coupon?.currency ?? null,
      name: promo.coupon?.name ?? null,
    });
  } catch (err) {
    console.error("[validate-promo] error:", err);
    return NextResponse.json(
      { error: "Failed to validate promo code" },
      { status: 500 }
    );
  }
}
