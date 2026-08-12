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
  /** FedEx packaging enum. YOUR_PACKAGING = customer supplies box
   *  (dimensions required). FEDEX_PAK = FedEx-branded envelope
   *  (dimensions optional, use FedEx defaults). */
  packagingType:
    | "YOUR_PACKAGING"
    | "FEDEX_PAK"
    | "FEDEX_BOX"
    | "FEDEX_ENVELOPE"
    | "FEDEX_TUBE";
  /** Dimensions in the given unit. Ignored by FedEx for FEDEX_PAK /
   *  FEDEX_ENVELOPE / FEDEX_BOX / FEDEX_TUBE — pass null for those. */
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  dimensionUnit: "IN" | "CM";
  declaredValue: number;
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
  customsValue: number;
  countryOfManufacture: string; // ISO-2
}

export interface ShippingProfile {
  kind: string;
  displayLabel: string;
  displaySubtitle: string;
  recipient: RecipientAddress;
  serviceType: string; // FedEx service enum
  /** Customs / declared-value currency for this profile. Mayo=USD,
   *  Armin=EUR. Applied uniformly to declaredValue, customsValue,
   *  and unitPrice — FedEx expects them all in the same currency. */
  currency: "USD" | "EUR" | "CAD" | "GBP";
  package: PackageSpec;
  commodity: CustomsCommodity;
  shipmentPurpose: "SOLD" | "GIFT" | "SAMPLE" | "REPAIR_AND_RETURN" | "PERSONAL_EFFECTS" | "NOT_SOLD";
  incoterm: "DDP" | "DAP" | "EXW" | "FOB" | "CIP" | "CFR" | "CIF" | "CPT" | "DDU" | "FCA" | "FAS";
  /** Who pays customs duties + taxes at destination. Mayo has this
   *  as RECIPIENT (per the invoice text "Recipient will pay all
   *  duties and taxes") despite the DDP incoterm. Armin has this
   *  as SENDER. Transport is always SENDER. */
  dutiesPaidBy: "SENDER" | "RECIPIENT";
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
  currency: "USD",
  package: {
    weightLb: 15,
    weightUnit: "LB",
    packagingType: "YOUR_PACKAGING",
    lengthIn: 18,
    widthIn: 10,
    heightIn: 10,
    dimensionUnit: "IN",
    declaredValue: 1,
    dryIceWeightKg: 4.54, // 10 lb ≈ 4.54 kg
  },
  commodity: {
    description:
      "Human UN3373 Biological Substance Non Infectious, Non Hazardous For lab diagnostics only",
    harmonizedCode: "3002.12.00.20",
    netWeightLb: 2,
    quantity: 15,
    quantityUnit: "PCS",
    customsValue: 1,
    countryOfManufacture: "CA",
  },
  shipmentPurpose: "NOT_SOLD",
  incoterm: "DDP",
  dutiesPaidBy: "RECIPIENT",
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

// ─── Armin Labs, Augsburg Germany ──────────────────────────────────
// Ambient-temperature blood-specimen shipment in a FedEx Pak (no dry
// ice, no dimensions — Pak uses FedEx-standard 12.5x9.5-ish). Sender
// pays both transport and duties (DDP incoterm actually honored on
// this profile, unlike Mayo).
//
// Sender address discrepancy noted 2026-08-12: the proforma-invoice
// PDF template Mike shared shows AvoVita at "1028 Bellevue Ave SE
// T2G 4L1" (old address) but the FedEx UI ship-from is 204 Cougartown
// Close (current). We use the current address for the shipment; Mike
// will regenerate the proforma template.
export const ARMIN_LABS: ShippingProfile = {
  kind: "armin_labs",
  displayLabel: "Ship Armin Labs Package",
  displaySubtitle:
    "Ambient FedEx Pak to Armin Labs, Germany · International Priority Express",
  recipient: {
    contactName: "Markus Berger",
    company: "Armin Labs",
    phone: "+4982178093150",
    email: "support@arminlabs.com",
    address: {
      line1: "Zirbelstr. 58",
      line2: "2nd Floor Branch Practice",
      city: "Augsburg",
      // Germany doesn't have provinces/states in FedEx sense — Bavaria
      // is the state but FedEx accepts empty stateOrProvinceCode for
      // most international destinations. Sending "BY" (Bavaria) as
      // the ISO 3166-2 subdivision code just in case.
      stateOrProvince: "BY",
      postalCode: "86154",
      country: "DE",
    },
    residential: false,
  },
  serviceType: "INTERNATIONAL_PRIORITY_EXPRESS",
  currency: "EUR",
  package: {
    weightLb: 2,
    weightUnit: "LB",
    packagingType: "FEDEX_PAK",
    // FedEx-branded packaging uses standard dimensions internally.
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    dimensionUnit: "IN",
    declaredValue: 20, // EUR
    dryIceWeightKg: 0,
  },
  commodity: {
    description: "Human blood specimens for diagnostic purposes, not for resale.",
    harmonizedCode: "30029010",
    netWeightLb: 2,
    quantity: 1,
    quantityUnit: "EA", // Armin invoice uses "1 SET / each"
    customsValue: 20, // EUR
    countryOfManufacture: "CA",
  },
  shipmentPurpose: "NOT_SOLD",
  incoterm: "DDP",
  dutiesPaidBy: "SENDER",
  consigneeForInvoice: {
    name: "Herr Markus Berger",
    company: "ArminLabs I Medicum Bad Aibling MVZ GmbH",
    address: "Zirbelstraße 58\nAugsburg 86154\nGermany",
    phone: "+4982178093150",
  },
  recipientNotifications: {
    email: "support@arminlabs.com",
    events: ["ON_TENDER", "ON_EXCEPTION"],
  },
  etdDocumentPaths: [
    // Mike uploads to Supabase Storage bucket "shipping-documents":
    //   - armin-proforma-invoice.pdf (1 page)
    // FedEx also auto-generates its own commercial invoice from the
    // commodity data above (3 copies printed with the label). Mike's
    // proforma is uploaded as a supplementary customs declaration —
    // note that its waybill number and date fields are blank on the
    // template; if customs delays become an issue we can add pdf-lib
    // to fill them programmatically.
    "armin-proforma-invoice.pdf",
  ],
};

// ─── EpiSeek / Precision Epigenomics, Tucson AZ ────────────────────
// Simpler than the other two: no dry ice, no attached PDFs — FedEx
// auto-generates the 2-page commercial invoice with a low-value
// statement and prints 3 copies alongside the waybill (3 copies).
// Total printed paperwork: 3 waybill + 6 CI = 9 pages.
export const EPISEEK: ShippingProfile = {
  kind: "episeek",
  displayLabel: "Ship EpiSeek Package",
  displaySubtitle:
    "Ambient FedEx Pak to Precision Epigenomics, Tucson AZ · International Priority Express",
  recipient: {
    contactName: "Laboratory Processing",
    company: "Precision Epigenomics",
    phone: "5203727522",
    email: "support@precision-epigenomics.com",
    address: {
      line1: "630 N. Alvernon Way",
      line2: "Suite 280B",
      city: "Tucson",
      stateOrProvince: "AZ",
      postalCode: "85711",
      country: "US",
    },
    residential: false,
  },
  serviceType: "INTERNATIONAL_PRIORITY_EXPRESS",
  currency: "USD",
  package: {
    weightLb: 1,
    weightUnit: "LB",
    packagingType: "FEDEX_PAK",
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    dimensionUnit: "IN",
    declaredValue: 1,
    dryIceWeightKg: 0,
  },
  commodity: {
    description: "Human blood specimen for diagnostic purposes only, not for resale.",
    harmonizedCode: "3002.12",
    netWeightLb: 0.5,
    quantity: 1,
    quantityUnit: "PCS",
    customsValue: 1,
    countryOfManufacture: "CA",
  },
  shipmentPurpose: "NOT_SOLD",
  incoterm: "DDP",
  dutiesPaidBy: "SENDER",
  consigneeForInvoice: {
    name: "Laboratory Processing",
    company: "Precision Epigenomics",
    address: "630 N. Alvernon Way\nSuite 280B\nTucson, AZ 85711",
    phone: "5203727522",
  },
  recipientNotifications: {
    email: "support@precision-epigenomics.com",
    events: ["ON_TENDER", "ON_EXCEPTION"],
  },
  etdDocumentPaths: [
    // Mike uploads to Supabase Storage bucket "shipping-documents":
    //   - episeek-commercial-invoice.pdf (2 pages: CI + declaration)
    // FedEx prints 3 copies alongside the waybill (3 copies of waybill
    // + 6 pages of CI + declaration = 9 pages total per shipment).
    // FedEx also auto-generates its own CI from the commodity data
    // above; Mike's uploaded doc is the customs-required declaration.
    "episeek-commercial-invoice.pdf",
  ],
};

// ─── Registry ─────────────────────────────────────────────────────
export const SHIPPING_PROFILES: Record<string, ShippingProfile> = {
  [MAYO_FROZEN.kind]: MAYO_FROZEN,
  [ARMIN_LABS.kind]: ARMIN_LABS,
  [EPISEEK.kind]: EPISEEK,
};

export function getShippingProfile(kind: string): ShippingProfile | null {
  return SHIPPING_PROFILES[kind] ?? null;
}
