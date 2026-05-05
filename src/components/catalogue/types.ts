/**
 * Shared types for the public test catalogue (Option C hybrid layout).
 */

export type CatalogueTest = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  price_cad: number | null;
  turnaround_display: string | null;
  specimen_type: string | null;
  /** @deprecated Legacy freeform — archived as ship_temp_legacy_freeform
   *  in migration 019. Use ship_temp for rendering. */
  ship_temp_legacy_freeform: string | null;
  handling_instructions: string | null;
  ship_temp:
    | "refrigerated_only"
    | "frozen_only"
    | "ambient_only"
    | "refrigerated_or_frozen"
    | null;
  stability_days: number | null;
  stability_days_frozen: number | null;
  /** Customer-facing search ranking boost. Higher = ranks higher when
   *  the query matches. Null / 0 means no pin. */
  search_priority: number | null;
  featured: boolean;
  sku: string | null;
  requisition_url: string | null;
  collection_method: "phlebotomist_draw" | "self_collected_kit";
  lab: { id: string; name: string };
  /** For panels: list of included tests (name + code). null for single tests. */
  panel_tests: PanelTestEntry[] | null;
};

export type PanelTestEntry = {
  name: string;
  code: string;
};

// ─── Cart item discriminated union ───────────────────────────────────
// All three product types share a common shape for display (name,
// price_cad, quantity) plus a line_type discriminator that determines
// which ID field is populated.

export type CartItemTest = {
  line_type: "test";
  test_id: string;
  test_name: string;
  price_cad: number;
  lab_name: string;
  quantity: number;
  /** Catalogue SKU. Optional because legacy localStorage carts pre-date
   *  this field — the CartProvider migration backfills via the test_id
   *  → tests table on hydration where possible. Used to identify
   *  Tuesday-only tests (CBC, DCTR) at the add-to-cart gate. */
  sku?: string | null;
  collection_method?: "phlebotomist_draw" | "self_collected_kit";
};

export type CartItemSupplement = {
  line_type: "supplement";
  supplement_id: string;
  sku: string;
  name: string;
  price_cad: number;
  quantity: number;
  image_url?: string | null;
};

export type CartItemResource = {
  line_type: "resource";
  resource_id: string;
  name: string;
  price_cad: number;
  quantity: 1; // Digital — always 1
};

/**
 * Admin-entered freeform line item carried over from an accepted quote.
 * The customer cannot add or modify these — they're locked at the
 * description and amount the admin set on the quote, identified by
 * `custom_id` (a stable client-side UUID assigned at quote-accept time
 * for cart deduplication).
 *
 * `notes` are admin-only — never rendered customer-side, but persisted
 * through the cart → Stripe metadata → orders.line_items.custom_notes
 * pipeline so admins can see "this $300 was Banff travel" later.
 */
export type CartItemCustom = {
  line_type: "custom";
  custom_id: string;
  /** Customer-facing label, mirrored as Stripe product name. */
  description: string;
  /** CAD dollars. Positive = charge, negative = credit. Locked at the
   *  quote-set value; not customer-editable. */
  price_cad: number;
  quantity: 1;
  /** Admin-only internal notes. Never shown to the customer. */
  notes?: string | null;
};

export type CartItem =
  | CartItemTest
  | CartItemSupplement
  | CartItemResource
  | CartItemCustom;

/** Unique identifier for deduplication within the cart. */
export function cartItemId(item: CartItem): string {
  switch (item.line_type) {
    case "test":
      return `test:${item.test_id}`;
    case "supplement":
      return `supp:${item.supplement_id}`;
    case "resource":
      return `res:${item.resource_id}`;
    case "custom":
      return `custom:${item.custom_id}`;
  }
}

/** Display name regardless of line type. */
export function cartItemName(item: CartItem): string {
  if (item.line_type === "test") return item.test_name;
  if (item.line_type === "custom") return item.description;
  return item.name;
}

/**
 * @deprecated Use CartItem instead. Kept as an alias for the test
 * variant so existing imports don't need a mass rename in this PR.
 */
export type CatalogueCartItem = CartItemTest;
