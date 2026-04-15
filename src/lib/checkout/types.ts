/**
 * Multi-person checkout types — shared between the wizard, the
 * Stripe checkout API, and the webhook that materialises everything
 * into Supabase rows after payment.
 *
 * "Person index" is a 0-based integer:
 *   - index 0  → account holder (you)
 *   - index 1+ → additional people
 *
 * Test assignments live in `assignments`: each entry pairs a test_id
 * with the index of the person it belongs to. The same test_id can
 * appear multiple times for different person indices.
 */

import type { Relationship } from "@/types/database";

export type Sex = "male" | "female" | "intersex";

export interface CheckoutPerson {
  index: number;
  is_account_holder: boolean;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  biological_sex: Sex | "";
  /** Optional mobile number, only collected for the account holder. */
  phone?: string | null;
  /** Required for additional people, null for the account holder. */
  relationship: Relationship | null;
  /** Mandatory for additional people; ignored for account holder. */
  consent_acknowledged: boolean;
  /** True when the additional person wants their own portal account. */
  wants_own_account?: boolean;
  /** Email for the additional person's own account. */
  own_account_email?: string;
}

export interface CollectionAddress {
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
}

export interface TestAssignment {
  test_id: string;
  test_name: string;
  lab_name: string;
  price_cad: number;
  /** 0-based index into the persons array. */
  assigned_to_person: number;
}

export interface VisitFees {
  base_fee: number;
  additional_fee_per_person: number;
  additional_person_count: number;
  total: number;
}

export interface CheckoutPayload {
  persons: CheckoutPerson[];
  collection_address: CollectionAddress;
  assignments: TestAssignment[];
  visit_fees: VisitFees;
  subtotal: number;
  /** Multi-test discount amount ($20 × line count, or 0 if under threshold). */
  discount_cad: number;
  total: number;
  account_user_id: string | null;
  /** Customer-facing Stripe Promotion Code string entered by the user. */
  promo_code?: string;
  /** Stripe Promotion Code id (`promo_xxx`) returned by validate-promo. */
  promotion_code_id?: string | null;
  /** White-label org slug — server resolves to org_id and tags the order. */
  org_slug?: string | null;
  /**
   * Representative (caregiver / POA) block. When present, `persons` are
   * the DEPENDENT clients being tested and the account is created under
   * the representative's contact info instead.
   *
   * When null/undefined, the existing "myself" flow applies — persons[0]
   * is the account holder as before. Backwards compatible.
   */
  representative?: RepresentativeBlock | null;
}

/** Resolved Stripe promotion code (returned by /api/checkout/validate-promo). */
export interface AppliedPromo {
  /** Stripe promotion code id (`promo_xxx`). */
  id: string;
  /** Customer-facing code string as entered. */
  code: string;
  /** Discount as a percentage, when the underlying coupon uses percent_off. */
  percent_off: number | null;
  /** Discount as a fixed amount in the smallest currency unit. */
  amount_off: number | null;
  /** ISO currency for amount_off (lowercase). */
  currency: string | null;
  /** Optional human-readable coupon name. */
  name: string | null;
}

export interface RepresentativeBlock {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  relationship:
    | "power_of_attorney"
    | "parent_guardian"
    | "spouse_partner"
    | "healthcare_worker"
    | "other";
  /** True when the rep has ticked the legal-authority checkbox. */
  poa_confirmed: boolean;
}
