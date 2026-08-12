/**
 * Preset shipment configurations for the /shipping page buttons.
 *
 * Each profile captures every field the FedEx Ship API needs plus
 * the customs / paperwork specifics for that recipient. The
 * /api/shipping/create-label route resolves a kind → profile,
 * builds the Ship API request, and returns the label URL.
 *
 * New profile checklist (for adding another recipient like Armin):
 *   1. Add a new SHIPPING_PROFILES entry with a stable kind slug.
 *   2. Add a matching button to /shipping page.
 *   3. Add any recipient-specific attached document PDFs to
 *      Supabase Storage under the shipping-documents bucket and
 *      reference the path in etdDocumentPaths.
 *
 * Sender + shipper metadata is shared across profiles because it's
 * always AvoVita — separated below so a future account move
 * (different pickup address, different phone) is one edit.
 */

// ─── Shared sender info (AvoVita) ──────────────────────────────────
export const SHIPPER = {
  contactName: "Mike Kuzmickas",
  company: "AvoVita Wellness",
  phone: "4038633933",
  email: "mike@avovita.ca",
  address: {
    line1: "204 Cougartown Close SW",
    line2: null as string | null,
    city: "Calgary",
    stateOrProvince: "AB",
    postalCode: "T3H0B2",
    country: "CA",
  },
  residential: false,
} as const;

// ─── Types ────────────────────────────────────────────────────────
export interface RecipientAddress {
  contactName: string;
  company: string | null;
  phone: string;
  email: string | null;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    stateOrProvince: string;
    postalCode: string;
    country: string; // ISO-2
  };
  residential: boolean;
}

export interface PackageSpec {
  weightLb: number;
  weightUnit: "LB" | "KG";
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  dimensionUnit: "IN" | "CM";
  declaredValueUsd: number;
  /** kg of dry ice in the package. 0 for non-dry-ice shipments.
   *  Requires hazmat-eligible FedEx account. */
  dryIceWeightKg: number;
}

export interface CustomsCommodity {
  description: string;
  harmonizedCode: string;
  netWeightLb: number;
  quantity: number;
  quantityUnit: string; // e.g. "PCS"
  customsValueUsd: number;
  countryOfManufacture: string; // ISO-2
}

export interface ShippingProfile {
  kind: string;
  displayLabel: string;
  displaySubtitle: string;
  recipient: RecipientAddress;
  serviceType: string; // FedEx service enum
  package: PackageSpec;
  commodity: CustomsCommodity;
  shipmentPurpose: "SOLD" | "GIFT" | "SAMPLE" | "REPAIR_AND_RETURN" | "PERSONAL_EFFECTS" | "NOT_SOLD";
  incoterm: "DDP" | "DAP" | "EXW" | "FOB" | "CIP" | "CFR" | "CIF" | "CPT" | "DDU" | "FCA" | "FAS";
  /** Consignee shown on the customs commercial invoice — often
   *  different from the FedEx Deliver-To (which points at the
   *  shipping dock). Mayo's is Dr. William Morice / Specimen
   *  Operations - Dock. */
  consigneeForInvoice: {
    name: string;
    company: string;
    address: string; // multi-line address as-is for the invoice
    phone: string;
  };
  /** Recipient email + which FedEx notifications to send them. */
  recipientNotifications: {
    email: string;
    events: Array<"ON_SHIPMENT" | "ON_TENDER" | "ON_ESTIMATED_DELIVERY" | "ON_DELIVERY" | "ON_EXCEPTION">;
  };
  /** Supabase Storage paths for any additional PDFs attached via
   *  FedEx Electronic Trade Documents (ETD). These get uploaded
   *  to FedEx before the Ship API call and referenced by the
   *  returned uploadId. Bucket: shipping-documents. */
  etdDocumentPaths: string[];
}

// ─── Mayo Clinic Labs, Frozen shipment ─────────────────────────────
export const MAYO_FROZEN: ShippingProfile = {
  kind: "mayo_frozen",
  displayLabel: "Ship Mayo Frozen",
  displaySubtitle:
    "Dry-ice package to Mayo Clinic Laboratories · International Priority Express",
  recipient: {
    contactName: "Global Logistics",
    company: "Mayo Clinic Laboratories",
    phone: "8005331710",
    email: "mliintl@mayo.edu",
    address: {
      line1: "3050 Superior Dr. NW",
      line2: null,
      city: "Rochester",
      stateOrProvince: "MN",
      postalCode: "55905",
      country: "US",
    },
    residential: false,
  },
  serviceType: "INTERNATIONAL_PRIORITY_EXPRESS",
  package: {
    weightLb: 15,
    weightUnit: "LB",
    lengthIn: 18,
    widthIn: 10,
    heightIn: 10,
    dimensionUnit: "IN",
    declaredValueUsd: 1,
    dryIceWeightKg: 4.54, // 10 lb ≈ 4.54 kg
  },
  commodity: {
    description:
      "Human UN3373 Biological Substance Non Infectious, Non Hazardous For lab diagnostics only",
    harmonizedCode: "3002.12.00.20",
    netWeightLb: 2,
    quantity: 15,
    quantityUnit: "PCS",
    customsValueUsd: 1,
    countryOfManufacture: "CA",
  },
  shipmentPurpose: "NOT_SOLD",
  incoterm: "DDP",
  consigneeForInvoice: {
    name: "Dr. William G. Morice II",
    company: "Mayo Clinic Laboratories",
    address:
      "Specimen Operations - Dock\n3050 Superior Drive NW\nRochester, MN 55905",
    phone: "1-800-533-1710",
  },
  recipientNotifications: {
    email: "RSTMMLTRANSINTL@mayo.edu",
    events: ["ON_TENDER", "ON_EXCEPTION"],
  },
  etdDocumentPaths: [
    // Mike uploads to Supabase Storage bucket "shipping-documents":
    //   - mayo-cdc-paperwork.pdf (7 pages: Mayo declaration + 2 CDC permits)
    // Commercial invoice is generated by FedEx automatically from the
    // commodity data above, so no separate PDF needed for that.
    "mayo-cdc-paperwork.pdf",
  ],
};

// ─── Armin Labs, Germany (awaiting details) ────────────────────────
// export const ARMIN_LABS: ShippingProfile = { ... }

// ─── Registry ─────────────────────────────────────────────────────
export const SHIPPING_PROFILES: Record<string, ShippingProfile> = {
  [MAYO_FROZEN.kind]: MAYO_FROZEN,
  // [ARMIN_LABS.kind]: ARMIN_LABS,
};

export function getShippingProfile(kind: string): ShippingProfile | null {
  return SHIPPING_PROFILES[kind] ?? null;
}
