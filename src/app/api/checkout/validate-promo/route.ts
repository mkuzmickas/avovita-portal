import { NextRequest, NextResponse } from "next/server";
import { applyPromoCode } from "@/lib/promo/promoCodes";

export const runtime = "nodejs";

/**
 * POST /api/checkout/validate-promo
 *
 * Body: { code: string; visitFeeCad?: number; preTaxCartCad?: number }
 *
 * Thin wrapper over `applyPromoCode` from the shared registry. The
 * client passes its live cart context so fee-line-targeted codes
 * (e.g., FREEMOBILE26) can reject up front when the target line
 * isn't in the cart. Whole-cart codes ignore the context.
 *
 * Stripe coupon IDs are no longer involved — the Stripe session
 * builder re-validates against the same registry and reduces
 * line_items itself. This endpoint is purely an inline-validation
 * feedback loop for the promo input field.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code: string | undefined =
      typeof body.code === "string" ? body.code.trim() : undefined;
    const visitFeeCad =
      typeof body.visitFeeCad === "number" && body.visitFeeCad >= 0
        ? body.visitFeeCad
        : 0;
    const preTaxCartCad =
      typeof body.preTaxCartCad === "number" && body.preTaxCartCad >= 0
        ? body.preTaxCartCad
        : 0;

    if (!code) {
      return NextResponse.json(
        { error: "Promo code is required" },
        { status: 400 }
      );
    }

    const result = applyPromoCode(code, { visitFeeCad, preTaxCartCad });
    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      code: result.code,
      type: result.type,
      displayLabel: result.display_label,
      percentOff: result.percentOff,
      amountCad: result.amountCad,
      discountCad: result.discount_cad,
      notice: result.notice,
    });
  } catch (err) {
    console.error("[validate-promo] error:", err);
    return NextResponse.json(
      { error: "Failed to validate promo code" },
      { status: 500 }
    );
  }
}
