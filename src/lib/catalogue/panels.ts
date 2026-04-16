import type { CatalogueTest } from "@/components/catalogue/types";

/**
 * SKUs for the "Comprehensive Panels" carousel on the public /tests
 * page and /org/[slug]/tests pages. Order matters — tests render in
 * this sequence. Missing SKUs are silently skipped by pickPanels() so
 * a typo or unreleased panel never shows a broken row on the site.
 *
 * To change what's in the carousel, edit this array. No admin UI.
 */
export const PANEL_SKUS = [
  "BASIC_METABOLIC_PANEL",
  "COMPREHENSIVE_METABOLIC_PANEL",
  "WOMENS_HORMONE_PANEL",
  "MENS_HORMONE_PANEL",
  "THYROID_FUNCTION_PANEL",
  "VITAMINS_MINERALS_ESSENTIAL",
  "VITAMINS_MINERALS_ADVANCED",
  "COVID_FALLOUT_PANEL",
];

/** Given the full catalogue, returns the panel tests in PANEL_SKUS order. */
export function pickPanels(allTests: CatalogueTest[]): CatalogueTest[] {
  const bySku = new Map<string, CatalogueTest>();
  for (const t of allTests) {
    if (t.sku) bySku.set(t.sku.toUpperCase(), t);
  }
  return PANEL_SKUS.flatMap((sku) => {
    const t = bySku.get(sku);
    return t ? [t] : [];
  });
}
