/**
 * Single source of truth for customer-facing promo codes.
 *
 * The code registry lives in this file, not the `promo_codes` DB table —
 * that table is vestigial as of FREEMOBILE26's introduction. Every
 * surface that validates, displays, or applies a promo must flow
 * through `applyPromoCode` so the discount math and copy stay in one
 * place. Adding/removing a code is a code deploy, which is the right
 * gate for three codes.
 *
 * To add a new code: append to PROMO_REGISTRY below and the full
 * pipeline (validate-promo, Stripe session builder, totals calculation,
 * checkout UI, admin read-only view) picks it up automatically.
 */

export type PromoType =
  | "whole_cart_percent"
  | "whole_cart_amount"
  | "flolabs_base_fee_waiver";

export interface PromoDefinition {
  /** Canonical uppercase code. Lookups normalise user input. */
  code: string;
  type: PromoType;
  /** For whole_cart_percent. 0-100. */
  percentOff?: number;
  /** For whole_cart_amount and flolabs_base_fee_waiver. CAD dollars. */
  amountCad?: number;
  /** ISO 8601 expiry (timezone-aware). Null = never expires. */
  validUntil: string | null;
  usageLimit: number | null;
  stackableWith: Array<"multi_test_discount">;
  /** Human-readable line label shown everywhere the discount renders. */
  displayLabel: string;
  /** Doc string describing the condition — not evaluated, just guidance. */
  appliesWhen: string;
  /** Short internal description for the admin read-only view. */
  description: string;
}

export const PROMO_REGISTRY: PromoDefinition[] = [
  {
    code: "FREEMOBILE26",
    type: "flolabs_base_fee_waiver",
    amountCad: 85,
    validUntil: "2026-12-31T23:59:59-07:00",
    usageLimit: null,
    stackableWith: ["multi_test_discount"],
    displayLabel: "FloLabs Fee Promo (FREEMOBILE26)",
    appliesWhen: "order has flolabs_base_fee line > 0",
    description: "Waives the $85 FloLabs collection fee. $55/additional-person fees still apply.",
  },
  {
    code: "AVOVITA-TEST",
    type: "whole_cart_percent",
    percentOff: 100,
    validUntil: null,
    usageLimit: null,
    stackableWith: ["multi_test_discount"],
    displayLabel: "AvoVita Internal Test",
    appliesWhen: "always",
    description: "AvoVita internal test code — 100% off whole cart.",
  },
  {
    code: "ABC-DEMO",
    type: "whole_cart_percent",
    percentOff: 100,
    validUntil: null,
    usageLimit: null,
    stackableWith: ["multi_test_discount"],
    displayLabel: "Always Best Care Demo",
    appliesWhen: "always",
    description: "Always Best Care demo code — 100% off whole cart.",
  },
];

export interface PromoOrderContext {
  /** Total home-visit fee in CAD dollars. 0 when the cart is kit-only. */
  visitFeeCad: number;
  /** Pre-tax cart total (tests post multi-test discount + visit fee +
   *  supplements + resources + kit fee) in CAD dollars. */
  preTaxCartCad: number;
}

export type PromoResult =
  | {
      valid: false;
      /** Customer-facing error copy shown near the promo input. */
      error: string;
    }
  | {
      valid: true;
      code: string;
      type: PromoType;
      /** Resolved dollar discount against the applicable target. For
       *  whole_cart_percent this is pre-computed against preTaxCartCad
       *  so server + client agree without recomputing. */
      discount_cad: number;
      applied_to_line: "whole_cart" | "flolabs_base_fee";
      display_label: string;
      /** Passed through so totals / Stripe can recompute if the cart
       *  changes between validation and checkout submit. */
      percentOff?: number;
      amountCad?: number;
      /** Soft notice — e.g., "Collection fee already waived" when the
       *  promo validates but the effective discount is $0. Never
       *  blocks application. */
      notice?: string;
    };

function getPromoDefinition(rawCode: string): PromoDefinition | null {
  const upper = rawCode.trim().toUpperCase();
  return PROMO_REGISTRY.find((p) => p.code === upper) ?? null;
}

function isExpired(def: PromoDefinition, now: Date = new Date()): boolean {
  if (!def.validUntil) return false;
  return new Date(def.validUntil).getTime() < now.getTime();
}

/**
 * Resolves a raw user-entered code against the registry + an order
 * context. Returns a friendly error on failure, a fully-resolved
 * result on success.
 *
 * Callers:
 *   • /api/checkout/validate-promo — gates the promo input field
 *   • /api/stripe/checkout + checkout-unified — re-validates at submit
 *     (never trust a client-supplied discount)
 *   • calculateTotals — via AppliedPromo, to render the discount line
 */
export function applyPromoCode(
  rawCode: string,
  ctx: PromoOrderContext
): PromoResult {
  const def = getPromoDefinition(rawCode);
  if (!def) return { valid: false, error: "Invalid promo code." };
  if (isExpired(def)) {
    return { valid: false, error: "This promo code has expired." };
  }

  switch (def.type) {
    case "flolabs_base_fee_waiver": {
      if (ctx.visitFeeCad <= 0) {
        return {
          valid: false,
          error: `${def.code} applies only when a FloLabs collection fee is charged.`,
        };
      }
      const target = def.amountCad ?? 0;
      // Cap at what's actually charged — if another mechanism already
      // zeroed the visit fee, the effective discount is $0 but the
      // promo still validates with a notice per spec.
      const discount = Math.min(target, ctx.visitFeeCad);
      const notice =
        discount < target ? "Collection fee already waived" : undefined;
      return {
        valid: true,
        code: def.code,
        type: def.type,
        discount_cad: Math.round(discount * 100) / 100,
        applied_to_line: "flolabs_base_fee",
        display_label: def.displayLabel,
        amountCad: target,
        ...(notice ? { notice } : {}),
      };
    }
    case "whole_cart_percent": {
      const percent = def.percentOff ?? 0;
      const raw = ctx.preTaxCartCad * (percent / 100);
      const discount = Math.max(0, Math.min(raw, ctx.preTaxCartCad));
      return {
        valid: true,
        code: def.code,
        type: def.type,
        discount_cad: Math.round(discount * 100) / 100,
        applied_to_line: "whole_cart",
        display_label: def.displayLabel,
        percentOff: percent,
      };
    }
    case "whole_cart_amount": {
      const target = def.amountCad ?? 0;
      const discount = Math.max(0, Math.min(target, ctx.preTaxCartCad));
      return {
        valid: true,
        code: def.code,
        type: def.type,
        discount_cad: Math.round(discount * 100) / 100,
        applied_to_line: "whole_cart",
        display_label: def.displayLabel,
        amountCad: target,
      };
    }
  }
}

/**
 * Narrow public lookup — used by the admin read-only view so it can
 * render the registry without pulling the apply logic in too.
 */
export function listPromoCodes(): PromoDefinition[] {
  return PROMO_REGISTRY;
}
