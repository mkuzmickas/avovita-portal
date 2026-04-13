/**
 * Shared types for the public test catalogue (Option C hybrid layout).
 */

export type CatalogueTest = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  price_cad: number;
  turnaround_display: string | null;
  specimen_type: string | null;
  ship_temp: string | null;
  stability_notes: string | null;
  order_type: string;
  featured: boolean;
  sku: string | null;
  requisition_url: string | null;
  lab: { id: string; name: string };
};

export type CatalogueCartItem = {
  test_id: string;
  test_name: string;
  price_cad: number;
  lab_name: string;
  quantity: number;
};
