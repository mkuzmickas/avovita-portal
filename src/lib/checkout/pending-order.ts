import type { CartItem } from "@/components/catalogue/types";
import type {
  CheckoutPerson,
  CollectionAddress,
  RepresentativeBlock,
} from "./types";
import type {
  SupplementFulfillment,
  SupplementShippingAddress,
} from "@/types/supplements";

/**
 * Pending order payload — the full cart snapshot stored in the
 * pending_orders table pre-payment. Stripe metadata carries only
 * the pending_order_id. The webhook fetches this row to create
 * the real order + order_lines after payment.
 */
export interface PendingOrderPayload {
  version: 2;

  // Cart composition flags (fail-safe: if undefined, treat as false)
  has_tests: boolean;
  has_supplements: boolean;
  has_resources: boolean;

  // Cart items — the full serialised CartItem union
  cart_items: CartItem[];

  // ── Test-specific fields (only populated when has_tests) ──────
  account_user_id: string | null;
  persons?: CheckoutPerson[];
  /** Test assignment: test_id → person_index with server-validated price. */
  test_assignments?: Array<{
    test_id: string;
    person_index: number;
    unit_price_cad: number;
  }>;
  collection_address?: CollectionAddress;
  visit_fees?: {
    base: number;
    additional_per_person: number;
    additional_count: number;
    total: number;
  };
  order_mode?: "self" | "caregiver";
  representative?: RepresentativeBlock | null;
  promo_code?: string | null;
  org_id?: string | null;

  // ── Contact fields (supplement-only / resource-only flows) ────
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_phone?: string;

  // ── Supplement-specific fields ────────────────────────────────
  supplement_fulfillment?: SupplementFulfillment | null;
  supplement_shipping_fee_cad?: number;
  supplement_shipping_address?: SupplementShippingAddress | null;

  // ── Computed totals (server-side authoritative) ───────────────
  subtotal_tests: number;
  subtotal_supplements: number;
  subtotal_resources: number;
  test_discount: number;
  total: number;
}
