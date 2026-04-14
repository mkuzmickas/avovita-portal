import type { VisitFees } from "./types";

export type VisitZone = "zone1" | "zone2" | "unserved";

// ─── Postal-code zone classification ──────────────────────────────────────
//
// Zone 1 — Calgary proper ($85 base)
// Zone 2 — Surrounding areas ($134 base — $85 + $49 surcharge)
// Unserved — everywhere else: block the user, show a support CTA.
//
// The lists are based on Canada Post FSA prefixes (first three characters
// of a postal code). Comparison is case-insensitive and ignores spaces.

const ZONE1_FSAS = new Set([
  "T1Y", "T1Z",
  "T2A", "T2B", "T2C", "T2E", "T2G", "T2H", "T2J", "T2K", "T2L",
  "T2M", "T2N", "T2P", "T2R", "T2S", "T2T", "T2V", "T2W", "T2X",
  "T2Y", "T2Z",
  "T3A", "T3B", "T3C", "T3E", "T3G", "T3H", "T3J", "T3K", "T3L",
  "T3M", "T3N", "T3P", "T3R", "T3S", "T3Z",
]);

const ZONE2_FSAS = new Set([
  "T1X", // Chestermere
  "T4A", // Airdrie
  "T4B", // Airdrie
  "T4C", // Cochrane
]);

/**
 * Extracts the FSA (first three characters, uppercase, no spaces) from a
 * raw postal-code string. Returns null if we can't pull three characters.
 */
export function extractFsa(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const cleaned = postalCode.toUpperCase().replace(/\s+/g, "");
  if (cleaned.length < 3) return null;
  return cleaned.slice(0, 3);
}

export function classifyPostalZone(
  postalCode: string | null | undefined
): VisitZone {
  const fsa = extractFsa(postalCode);
  if (!fsa) return "unserved";
  if (ZONE1_FSAS.has(fsa)) return "zone1";
  if (ZONE2_FSAS.has(fsa)) return "zone2";
  return "unserved";
}

/**
 * Computes the FloLabs home visit fee for a single collection address.
 *
 * Zone is derived from the collection postal code. Callers that don't have
 * a postal code yet (e.g. the admin quote builder before an address is
 * entered) pass null and receive the Zone 1 default — pricing is finalised
 * once the real postal code is entered, and the server re-validates.
 *
 * For an "unserved" postal code we still return a fee shape so the summary
 * can render, but the parent UI is expected to block the Continue button
 * using `zone === "unserved"`.
 */
export function computeVisitFees(
  personCount: number,
  postalCode?: string | null
): VisitFees & { zone: VisitZone; postal_code: string | null } {
  const zone = classifyPostalZone(postalCode);

  const zone1Base = Number(process.env.NEXT_PUBLIC_HOME_VISIT_FEE_BASE ?? 85);
  const zone2Base = Number(
    process.env.NEXT_PUBLIC_HOME_VISIT_FEE_ZONE2 ?? 134
  );
  const additionalRate = Number(
    process.env.NEXT_PUBLIC_HOME_VISIT_FEE_ADDITIONAL ?? 55
  );

  // Unserved postal codes surface a zero/base fee shape — the UI still
  // blocks Continue. Falling back to zone1 pricing here avoids NaN
  // downstream if an old client somehow bypasses the gate.
  const base = zone === "zone2" ? zone2Base : zone1Base;
  const additionalCount = Math.max(0, personCount - 1);
  const total = base + additionalCount * additionalRate;

  return {
    base_fee: base,
    additional_fee_per_person: additionalRate,
    additional_person_count: additionalCount,
    total,
    zone,
    postal_code: postalCode ?? null,
  };
}
