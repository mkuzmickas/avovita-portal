/**
 * Stability-constrained test detection.
 *
 * Tests with short sample stability windows need collection between
 * Saturday and Tuesday so specimens can ship on the Tuesday run and
 * arrive at the lab within viability.
 *
 * The constrained SKU list is configured via env var so Mike can add
 * new SKUs without a code change:
 *   NEXT_PUBLIC_STABILITY_CONSTRAINED_SKUS="HBA1C,FNIRM,CMP"
 */

export function getStabilityConstrainedSkus(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_STABILITY_CONSTRAINED_SKUS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

/**
 * Given a list of test objects with SKUs, returns the names of any
 * that are stability-constrained. Returns empty array if none match.
 */
export function findStabilityConstrainedTests(
  tests: Array<{ name: string; sku: string | null }>,
): string[] {
  const constrained = getStabilityConstrainedSkus();
  if (constrained.size === 0) return [];
  return tests
    .filter((t) => t.sku && constrained.has(t.sku.toUpperCase()))
    .map((t) => t.name);
}
