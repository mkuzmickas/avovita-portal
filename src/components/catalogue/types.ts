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

export type CatalogueCartItem = {
  test_id: string;
  test_name: string;
  price_cad: number;
  lab_name: string;
  quantity: number;
};
