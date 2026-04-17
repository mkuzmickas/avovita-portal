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
  ship_temp: string | null;
  stability_notes: string | null;
  featured: boolean;
  sku: string | null;
  requisition_url: string | null;
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

export type CartItem = CartItemTest | CartItemSupplement | CartItemResource;

/** Unique identifier for deduplication within the cart. */
export function cartItemId(item: CartItem): string {
  switch (item.line_type) {
    case "test":
      return `test:${item.test_id}`;
    case "supplement":
      return `supp:${item.supplement_id}`;
    case "resource":
      return `res:${item.resource_id}`;
  }
}

/** Display name regardless of line type. */
export function cartItemName(item: CartItem): string {
  return item.line_type === "test" ? item.test_name : item.name;
}

/**
 * @deprecated Use CartItem instead. Kept as an alias for the test
 * variant so existing imports don't need a mass rename in this PR.
 */
export type CatalogueCartItem = CartItemTest;
