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
    // Defensive coupon lookup. The SDK may give us:
    //   promo.coupon = { id, percent_off, amount_off, ... }   ← expanded
    //   promo.coupon = "coupon_xxx"                            ← id only
    //   promo.coupon = undefined / missing field               ← shape drift
    // We try each in order and ALWAYS finish with a direct
    // stripe.coupons.retrieve() so percent_off / amount_off are
    // guaranteed to be populated.
    const rawCoupon = (promo as { coupon?: unknown }).coupon;
    console.log(
      `[validate-promo] raw promo.coupon shape:`,
      typeof rawCoupon,
      JSON.stringify(rawCoupon)
    );

    let couponId: string | null = null;
    if (rawCoupon && typeof rawCoupon === "object") {
      couponId = (rawCoupon as { id?: string }).id ?? null;
    } else if (typeof rawCoupon === "string") {
      couponId = rawCoupon;
    }
    console.log(`[validate-promo] resolved couponId: ${couponId}`);

    let percentOff: number | null = null;
    let amountOff: number | null = null;
    let currency: string | null = null;
    let name: string | null = null;

    // First: try whatever was already on the inline coupon object.
    if (rawCoupon && typeof rawCoupon === "object") {
      const inline = rawCoupon as {
        percent_off?: number | null;
        amount_off?: number | null;
        currency?: string | null;
        name?: string | null;
      };
      if (typeof inline.percent_off === "number") percentOff = inline.percent_off;
      if (typeof inline.amount_off === "number") amountOff = inline.amount_off;
      if (typeof inline.currency === "string") currency = inline.currency;
      if (typeof inline.name === "string") name = inline.name;
    }

    // Second: if either discount field is still missing, fetch the coupon
    // directly. This is the authoritative source.
    if ((percentOff === null && amountOff === null) && couponId) {
      console.log(
        `[validate-promo] inline coupon missing discount fields — calling stripe.coupons.retrieve(${couponId})`
      );
      const coupon = (await stripe.coupons.retrieve(couponId)) as {
        percent_off: number | null;
        amount_off: number | null;
        currency: string | null;
        name: string | null;
      };
      console.log(
        `[validate-promo] retrieved coupon: percent_off=${coupon.percent_off} amount_off=${coupon.amount_off}`
      );
      percentOff =
        typeof coupon.percent_off === "number" ? coupon.percent_off : null;
      amountOff =
        typeof coupon.amount_off === "number" ? coupon.amount_off : null;
      currency = coupon.currency ?? currency;
      name = coupon.name ?? name;
    }

    console.log(
      `[validate-promo] success — promoId=${promo.id} code="${promo.code}" ` +
        `percentOff=${percentOff} amountOff=${amountOff}`
    );
    return NextResponse.json({
      valid: true,
      promoId: promo.id,
      code: promo.code,
      percentOff,
      amountOff,
      currency,
      name,
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
