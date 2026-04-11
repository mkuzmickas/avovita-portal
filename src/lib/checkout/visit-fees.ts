import type { VisitFees } from "./types";

/**
 * Computes the FloLabs home visit fee for a single collection address with
 * `personCount` people. Reads base + additional rates from the public env
 * vars so a single config change updates the entire app.
 */
export function computeVisitFees(personCount: number): VisitFees {
  const base = Number(process.env.NEXT_PUBLIC_HOME_VISIT_FEE_BASE ?? 85);
  const additionalRate = Number(
    process.env.NEXT_PUBLIC_HOME_VISIT_FEE_ADDITIONAL ?? 55
  );

  const additionalCount = Math.max(0, personCount - 1);
  const total = base + additionalCount * additionalRate;

  return {
    base_fee: base,
    additional_fee_per_person: additionalRate,
    additional_person_count: additionalCount,
    total,
  };
}
