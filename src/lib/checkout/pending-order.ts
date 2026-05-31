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
  /**
   * True when the customer picked "I'm from out of town" on Step 3.
   * In that mode the address fields are blank (the drop-in address is
   * communicated by AvoVita and rendered on the success page from
   * NEXT_PUBLIC_OUT_OF_TOWN_DROPIN_ADDRESS). Persisted on the orders
   * row as is_out_of_town so the success page knows which Acuity
   * calendar to render.
   */
  is_out_of_town?: boolean;
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

  // ── Kit service fee ────────────────────────────────────────────
  kit_service_fee?: number;

  // ── Custom cart lines (from an accepted quote) ────────────────
  /**
   * Admin-entered freeform charge / credit lines carried over from
   * an accepted quote. Each entry becomes a Stripe line item AND an
   * order_lines row with line_type='custom'. `notes` ride along for
   * admin visibility but are stripped from any customer-facing
   * surface (Stripe product name, confirmation email).
   */
  custom_lines?: Array<{
    custom_id: string;
    description: string;
    amount_cad: number;
    notes?: string | null;
  }>;

  // ── Computed totals (server-side authoritative) ───────────────
  subtotal_tests: number;
  subtotal_supplements: number;
  subtotal_resources: number;
  test_discount: number;
  total: number;
}
