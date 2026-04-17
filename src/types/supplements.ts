// =============================================================================
// AvoVita Patient Portal — Supplement Types
// =============================================================================
//
// Phase 1 types for the supplements product line. These mirror the
// supplements table schema and extend the existing Order / OrderLine
// types with supplement-specific fields.
//
// Feature-gated behind NEXT_PUBLIC_ENABLE_SUPPLEMENTS.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Core supplement types
// ─────────────────────────────────────────────────────────────────────────────

export interface Supplement {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price_cad: number;
  cost_cad: number | null;
  category: string | null;
  brand: string | null;
  active: boolean;
  featured: boolean;
  track_inventory: boolean;
  stock_qty: number;
  low_stock_threshold: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export type SupplementFulfillment = "shipping" | "coordinated";

export type OrderLineType = "test" | "supplement";

/**
 * Shipping address captured when supplement_fulfillment = 'shipping'.
 * Stored as JSONB on orders.supplement_shipping_address.
 */
export interface SupplementShippingAddress {
  name: string;
  street: string;
  city: string;
  province: string;
  postal: string;
  country: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature flag helper
// ─────────────────────────────────────────────────────────────────────────────

export function isSupplementsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SUPPLEMENTS === "true";
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Flat-rate shipping fee (CAD) for supplement-only or mixed orders. */
export const SUPPLEMENT_SHIPPING_FEE_CAD = 40;
