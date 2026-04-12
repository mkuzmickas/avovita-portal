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
  /** Required for additional people, null for the account holder. */
  relationship: Relationship | null;
  /** Mandatory for additional people; ignored for account holder. */
  consent_acknowledged: boolean;
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
  /** Test promo code — only honoured when NEXT_PUBLIC_ENABLE_TEST_MODE=true. */
  promo_code?: string;
}
