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
    console.log(
      `[validate-promo] success — id=${promo.id} code="${promo.code}" coupon=${JSON.stringify(promo.coupon)}`
    );
    return NextResponse.json({
      id: promo.id,
      code: promo.code,
      percent_off: promo.coupon?.percent_off ?? null,
      amount_off: promo.coupon?.amount_off ?? null,
      currency: promo.coupon?.currency ?? null,
      name: promo.coupon?.name ?? null,
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
