import type { CartItem } from "@/components/catalogue/types";

/** Full kit courier (delivery + pickup) when no phlebotomist visit. */
export const KIT_FEE_FULL = 60;
/** Pickup-only fee when phlebotomist delivers the kit. */
export const KIT_FEE_PICKUP_ONLY = 30;

export type KitFeeResult = {
  /** Fee amount in CAD (0 if no kit tests). */
  amount: number;
  /** Display label for the fee line. */
  label: string;
  /** Whether any self-collected kit tests are in the cart. */
  hasKitTests: boolean;
  /** Whether the order also has phlebotomist-draw tests. */
  hasPhlebotomistTests: boolean;
};

/**
 * Calculates the self-collected kit service fee based on cart composition.
 *
 * Rules:
 *   - Zero kit tests → $0, no line displayed
 *   - Kit tests only (no phlebotomist draw) → $60 (two-way courier)
 *   - Kit tests + phlebotomist draw tests → $30 (pickup only)
 *   - Fee is flat per order, regardless of kit test count
 */
export function computeKitServiceFee(cart: CartItem[]): KitFeeResult {
  const testItems = cart.filter((i) => i.line_type === "test");

  const hasKitTests = testItems.some(
    (t) =>
      t.line_type === "test" &&
      t.collection_method === "self_collected_kit",
  );
  const hasPhlebotomistTests = testItems.some(
    (t) =>
      t.line_type === "test" &&
      (t.collection_method === "phlebotomist_draw" ||
        !t.collection_method), // default to phlebotomist if missing
  );

  if (!hasKitTests) {
    return {
      amount: 0,
      label: "",
      hasKitTests: false,
      hasPhlebotomistTests,
    };
  }

  if (hasPhlebotomistTests) {
    return {
      amount: KIT_FEE_PICKUP_ONLY,
      label:
        "Self-Collected Kit Service (pickup only — delivered with phlebotomist visit)",
      hasKitTests: true,
      hasPhlebotomistTests: true,
    };
  }

  return {
    amount: KIT_FEE_FULL,
    label: "Self-Collected Kit Service (delivery + pickup)",
    hasKitTests: true,
    hasPhlebotomistTests: false,
  };
}
