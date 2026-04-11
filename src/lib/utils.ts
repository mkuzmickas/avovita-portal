import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CartItem, PatientProfile, VisitFeeBreakdown } from "@/types/database";

// ─── className helper ─────────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Currency formatting ──────────────────────────────────────────────────────
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Visit fee calculation ────────────────────────────────────────────────────
/**
 * Groups cart items by profile address and calculates visit fees.
 * Base fee: $85 for first person per address.
 * Additional fee: $55 per additional person at the same address.
 */
export function calculateVisitFees(
  cartItems: CartItem[],
  profiles: PatientProfile[]
): VisitFeeBreakdown[] {
  const BASE_FEE = Number(process.env.NEXT_PUBLIC_HOME_VISIT_FEE_BASE ?? 85);
  const ADDITIONAL_FEE = Number(process.env.NEXT_PUBLIC_HOME_VISIT_FEE_ADDITIONAL ?? 55);

  // Build profile map
  const profileMap = new Map<string, PatientProfile>(
    profiles.map((p) => [p.id, p])
  );

  // Group profile IDs by address key
  const addressGroups = new Map<string, { label: string; profileIds: Set<string> }>();

  for (const item of cartItems) {
    const profile = profileMap.get(item.profile_id);
    if (!profile) continue;

    const addressKey = [
      profile.address_line1 ?? "",
      profile.city ?? "",
      profile.province ?? "",
      profile.postal_code ?? "",
    ]
      .join("|")
      .toLowerCase()
      .trim();

    const label = [
      profile.address_line1,
      profile.city,
      profile.province,
      profile.postal_code,
    ]
      .filter(Boolean)
      .join(", ");

    if (!addressGroups.has(addressKey)) {
      addressGroups.set(addressKey, { label, profileIds: new Set() });
    }
    addressGroups.get(addressKey)!.profileIds.add(item.profile_id);
  }

  const breakdowns: VisitFeeBreakdown[] = [];

  for (const [key, { label, profileIds }] of addressGroups.entries()) {
    const personCount = profileIds.size;
    const additionalCount = Math.max(0, personCount - 1);
    const baseFee = BASE_FEE;
    const additionalFee = additionalCount * ADDITIONAL_FEE;

    breakdowns.push({
      address_key: key,
      address_label: label || "Address on file",
      profile_ids: Array.from(profileIds),
      person_count: personCount,
      base_fee: baseFee,
      additional_fee: additionalFee,
      total_fee: baseFee + additionalFee,
    });
  }

  return breakdowns;
}

// ─── Slug generation ──────────────────────────────────────────────────────────
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateStr));
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}
