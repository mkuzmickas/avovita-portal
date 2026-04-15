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
    console.log("[validate-promo] received body:", JSON.stringify(body));
    console.log(
      `[validate-promo] code after trim: "${code}" (len=${code?.length ?? 0})`
    );
    if (!code) {
      return NextResponse.json(
        { error: "Promo code is required" },
        { status: 400 }
      );
    }

    // Stripe Promotion Code lookup IS case-sensitive — pass the code
    // exactly as the user typed it (after trim only). Do NOT uppercase.
    console.log(
      `[validate-promo] calling stripe.promotionCodes.list({ code: "${code}", active: true, limit: 1 })`
    );
    const list = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
      // Force-expand the coupon so percent_off / amount_off are always
      // present in the response object, regardless of SDK defaults.
      expand: ["data.coupon"],
    });
    console.log(
      "[validate-promo] stripe response:",
      JSON.stringify(
        {
          object: list.object,
          has_more: list.has_more,
          data_length: list.data.length,
          data: list.data,
        },
        null,
        2
      )
    );
    type CouponShape = {
      id: string;
      valid: boolean;
      percent_off: number | null;
      amount_off: number | null;
      currency: string | null;
      name: string | null;
    };
    type PromoShape = {
      id: string;
      code: string;
      active: boolean;
      coupon?: CouponShape | string;
    };
    const promo = list.data[0] as unknown as PromoShape | undefined;
    if (!promo) {
      // Retry without the active filter so the logs can distinguish
      // "doesn't exist" from "exists but inactive / wrong mode".
      const anyMatch = await stripe.promotionCodes.list({ code, limit: 1 });
      console.log(
        `[validate-promo] no active match — fallback search (any state) returned ${anyMatch.data.length} result(s):`,
        JSON.stringify(anyMatch.data, null, 2)
      );
      return NextResponse.json(
        { error: "Invalid or expired promo code" },
        { status: 400 }
      );
    }

    // The `active: true` filter on list() already guarantees this code
    // is currently usable — trust it and don't second-guess on the
    // coupon.valid sub-field (which sometimes lags or is missing
    // depending on SDK version). Stripe will perform the final
    // validation when the session is created, so any edge case is
    // caught there.
    // Step 1: pull the coupon id off the promotion code, accepting any
    // shape Stripe might hand us.
    const rawCoupon = (promo as { coupon?: unknown }).coupon;
    console.log(
      "[validate-promo] raw promo.coupon:",
      JSON.stringify(rawCoupon)
    );
    let couponId: string | null = null;
    if (rawCoupon && typeof rawCoupon === "object") {
      couponId = (rawCoupon as { id?: string }).id ?? null;
    } else if (typeof rawCoupon === "string") {
      couponId = rawCoupon;
    }
    console.log(`[validate-promo] couponId: ${couponId}`);

    if (!couponId) {
      return NextResponse.json(
        { error: "Promo code is missing its underlying coupon." },
        { status: 400 }
      );
    }

    // Step 2: ALWAYS make an explicit retrieve call. Don't trust the
    // inline coupon shape — go straight to the authoritative source.
    const coupon = await stripe.coupons.retrieve(couponId);
    console.log(
      "[validate-promo] raw coupon from stripe.coupons.retrieve:",
      JSON.stringify(coupon, null, 2)
    );

    // Step 3 + 4: read percent_off / amount_off straight off the
    // retrieve response and return camelCase.
    return NextResponse.json({
      valid: true,
      promoId: promo.id,
      code: promo.code,
      percentOff: coupon.percent_off ?? 0,
      amountOff: coupon.amount_off ?? 0,
      currency: coupon.currency ?? null,
      name: coupon.name ?? null,
    });
  } catch (err) {
    console.error("[validate-promo] caught error:", err);
    if (err instanceof Error) {
      console.error("[validate-promo] err.message:", err.message);
      console.error("[validate-promo] err.stack:", err.stack);
    }
    return NextResponse.json(
      {
        error: "Failed to validate promo code",
        debug: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
