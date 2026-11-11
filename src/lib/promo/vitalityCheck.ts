import type { CartItem, CartItemTest } from "@/components/catalogue/types";

/**
 * Free Vitality Check promo.
 *
 * Any order with 2+ paid test lines unlocks a free third test chosen
 * from a curated low-lab-cost shortlist. The promo is opt-in — a popup
 * in the checkout flow prompts the client to pick one of the options
 * (or to add a second test when they only have one in cart).
 *
 * All logic in this file is **display / UX only**. Server-side
 * authority lives in the Stripe checkout route — a spoofed
 * `promo_vitality` flag on the client cannot unlock a freebie because
 * the server re-runs `validatePromoEligibility` before building the
 * Stripe session and before writing order_lines.
 *
 * Behind a flag for pilot:
 *   NEXT_PUBLIC_VITALITY_CHECK_ENABLED=true
 * Default off in prod. Mike sets it in `.env.local` while testing.
 */

export const VITALITY_CHECK_ENABLED =
  process.env.NEXT_PUBLIC_VITALITY_CHECK_ENABLED === "true";

export const VITALITY_CHECK_MIN_PAID_TESTS = 2;

/**
 * Curated giveaway options — low lab cost, broad demographic appeal,
 * no special collection timing. The data-layer test_id is looked up
 * at modal-open time from the tests table so we don't bake UUIDs into
 * code.
 */
export const VITALITY_CHECK_OPTIONS = [
  {
    sku: "FERR1",
    label: "Ferritin",
    tagline: "Iron storage & fatigue marker",
    audience: "Common for athletes, women, anyone tracking energy / anemia.",
  },
  {
    sku: "TTST",
    label: "Testosterone, Total",
    tagline: "Men's vitality baseline",
    audience: "Common for men tracking mood, strength, libido, or TRT prep.",
  },
  {
    sku: "STSH",
    label: "Thyroid Stimulating Hormone (TSH)",
    tagline: "Thyroid function screen",
    audience:
      "Common for anyone tracking metabolism, weight, hair, or temperature.",
  },
] as const;

export const VITALITY_CHECK_SKUS: ReadonlySet<string> = new Set<string>(
  VITALITY_CHECK_OPTIONS.map((o) => o.sku),
);

export type VitalitySku = (typeof VITALITY_CHECK_OPTIONS)[number]["sku"];

export const VITALITY_CHECK_TERMS = [
  "Your free Vitality Check must be collected for the same person as your other tests on this order — it is not transferable to another person.",
  "It is collected at the same appointment as the rest of the order; it cannot be scheduled separately or redeemed later.",
  "Available only when your order contains 2 or more paid test lines. The free test does not itself count toward that minimum.",
  "Not combinable with other test-level promotions or quote-entered manual discounts.",
  "Available per order, not per account — one free Vitality Check per qualifying order.",
  "AvoVita may adjust or end this promotion at any time.",
];

export function paidTestLines(cart: CartItem[]): CartItemTest[] {
  return cart.filter(
    (i): i is CartItemTest =>
      i.line_type === "test" && i.promo_vitality !== true,
  );
}

export function vitalityCheckLine(cart: CartItem[]): CartItemTest | null {
  return (
    cart.find(
      (i): i is CartItemTest =>
        i.line_type === "test" && i.promo_vitality === true,
    ) ?? null
  );
}

export function cartHasVitalityCheck(cart: CartItem[]): boolean {
  return vitalityCheckLine(cart) !== null;
}

/**
 * Minimum conditions for the promo. The server also re-runs this
 * before writing the Stripe session or materialising order_lines.
 *
 * Note: the "same person" rule is enforced at the Step 2 / Stripe
 * create path, NOT here. On a single-person cart there's only one
 * profile, so the rule is satisfied implicitly. On a multi-person
 * cart we require that every paid test AND the promo test be
 * assigned to the same person_index, and surface a message in the
 * modal so the client knows up front.
 */
export function isCartEligibleForVitalityCheck(cart: CartItem[]): boolean {
  if (!VITALITY_CHECK_ENABLED) return false;
  return paidTestLines(cart).length >= VITALITY_CHECK_MIN_PAID_TESTS;
}

/**
 * Nudge trigger — show the "add one more test" modal when the client
 * has exactly ONE paid test and hasn't yet claimed the freebie.
 */
export function shouldNudgeForVitalityCheck(cart: CartItem[]): boolean {
  if (!VITALITY_CHECK_ENABLED) return false;
  if (cartHasVitalityCheck(cart)) return false;
  return paidTestLines(cart).length === 1;
}

/**
 * Picker trigger — show the "pick your free Vitality Check" modal
 * when the client has 2+ paid tests and hasn't yet claimed.
 */
export function shouldOfferVitalityCheck(cart: CartItem[]): boolean {
  if (!VITALITY_CHECK_ENABLED) return false;
  if (cartHasVitalityCheck(cart)) return false;
  return paidTestLines(cart).length >= VITALITY_CHECK_MIN_PAID_TESTS;
}

/**
 * Server-side validator — re-run just before the Stripe session is
 * created. Rejects any `promo_vitality: true` test line that would
 * not qualify: cart no longer has 2+ paid tests, or (in multi-person
 * carts) the promo line isn't assigned to the same person as the
 * paid tests.
 *
 * Caller passes `promoAssignedToPersonIndex` as the person_index the
 * UI picked for the promo (or null on single-person). Mismatched
 * assignments are the main multi-person edge case.
 */
export interface PromoValidationArgs {
  cart: CartItem[];
  /** person_index each paid test is going to. Pass empty array for
   *  single-person carts where everything implicitly goes to person 0. */
  paidAssignments?: Array<{ test_id: string; person_index: number }>;
  promoAssignedToPersonIndex?: number | null;
}

export function validatePromoEligibility(args: PromoValidationArgs):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!VITALITY_CHECK_ENABLED) {
    return { ok: false, reason: "Vitality Check promotion is not active." };
  }
  const paid = paidTestLines(args.cart);
  if (paid.length < VITALITY_CHECK_MIN_PAID_TESTS) {
    return {
      ok: false,
      reason: `Needs ${VITALITY_CHECK_MIN_PAID_TESTS}+ paid tests to qualify.`,
    };
  }
  const promo = vitalityCheckLine(args.cart);
  if (!promo) return { ok: true };
  if (!promo.sku || !VITALITY_CHECK_SKUS.has(promo.sku)) {
    return {
      ok: false,
      reason: "Free Vitality Check must be one of the offered options.",
    };
  }
  // Multi-person: require promo and ALL paid tests at the same person.
  const assignments = args.paidAssignments ?? [];
  if (assignments.length > 0) {
    const first = assignments[0].person_index;
    const allSame = assignments.every((a) => a.person_index === first);
    if (!allSame) {
      return {
        ok: false,
        reason:
          "All qualifying tests must be assigned to the same person for the free Vitality Check.",
      };
    }
    const pi = args.promoAssignedToPersonIndex ?? first;
    if (pi !== first) {
      return {
        ok: false,
        reason:
          "Free Vitality Check must go to the same person as the qualifying tests.",
      };
    }
  }
  return { ok: true };
}
