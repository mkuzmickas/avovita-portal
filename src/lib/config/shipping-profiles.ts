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

/**
 * Recipe for turning a template PDF (uploaded to Supabase Storage) into
 * a filled-in commercial invoice. We stamp tracking # / date / signature
 * onto the template at the coordinates below. Coordinates are in PDF
 * points, measured from the bottom-left corner (standard PDF convention).
 * Letter size = 612 x 792 points.
 *
 * All coordinates are best-guess on first ship — iterate visually.
 */
export interface CommercialInvoiceOverlay {
  /** Path in shipping-documents Supabase Storage bucket. */
  templatePath: string;
  /** Every spot on the template that needs the tracking number stamped. */
  trackingNumberOverlays: OverlayTextPoint[];
  /** Every spot that needs the ship date. */
  dateOverlays: OverlayTextPoint[];
  /** Where to embed the shipper's signature image (optional — if the
   *  template is pre-signed, leave undefined). */
  signatureOverlay?: OverlayImagePoint;
}

export interface OverlayTextPoint {
  pageIndex: number; // 0-indexed
  x: number;
  y: number;
  fontSize?: number; // default 10
  /** 'iso' = 2026-08-12, 'us' = 08/12/2026, 'long' = 12 August 2026. */
  format?: "iso" | "us" | "long";
}

export interface OverlayImagePoint {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** How to build the printable commercial invoice for this profile
   *  from a template PDF in Supabase Storage. Stamps tracking # / date /
   *  signature onto the template at the specified coordinates. Printed
   *  3× and included in the FedEx pouch. */
  commercialInvoice: CommercialInvoiceOverlay;
  /** Supabase Storage paths for any additional customs paperwork that
   *  goes in the pouch beyond the commercial invoice — e.g. Mayo's
   *  CDC import permits. Printed 1×. Bucket: shipping-documents. */
  etdDocumentPaths: string[];
}

// ─── Mayo Clinic Labs, Frozen shipment ─────────────────────────────
export const MAYO_FROZEN: ShippingProfile = {
  kind: "mayo_frozen",
  displayLabel: "Ship Mayo Frozen",
  displaySubtitle:
    "Dry-ice package to Mayo Clinic Laboratories · International Priority",
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
  serviceType: "INTERNATIONAL_PRIORITY",
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
  commercialInvoice: {
    // Mike uploads: mayo-commercial-invoice.pdf (1 page — Commercial
    // Invoice template with blank INTERNATIONAL AIRWAYBILL NO. + DATE
    // OF EXPORTATION cells at top, and a Date: field at the bottom.
    // Template comes pre-signed so no signature overlay needed.
    templatePath: "mayo-commercial-invoice.pdf",
    trackingNumberOverlays: [
      // Top-left cell "INTERNATIONAL AIRWAYBILL NO." — blank line
      // between the label (~y=705) and the SHIPPER row (~y=685).
      { pageIndex: 0, x: 105, y: 695, fontSize: 12 },
    ],
    dateOverlays: [
      // Top-right cell "DATE OF EXPORTATION" — same blank line height.
      { pageIndex: 0, x: 340, y: 695, fontSize: 12, format: "iso" },
      // "Date:" label just under the signature block — sits to the
      // right of the label text.
      { pageIndex: 0, x: 110, y: 192, fontSize: 10, format: "iso" },
    ],
    signatureOverlay: undefined,
  },
  etdDocumentPaths: [
    // Existing 7-page combined PDF (Mayo declaration + 2 CDC import
    // permits). Printed 1× as supplementary paperwork. Slight overlap
    // with the 3× CI (declaration appears in both) — customs accepts
    // this and it avoids Mike having to maintain two split files.
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
    "Ambient FedEx Pak to Armin Labs, Germany · International Priority",
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
  serviceType: "INTERNATIONAL_PRIORITY",
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
  commercialInvoice: {
    // Mike uploads: armin-proforma-invoice.pdf (1 page — proforma
    // pre-signed by Armin "M.B" at bottom left). Waybill + Date cells
    // live in the right column at the top of the page.
    templatePath: "armin-proforma-invoice.pdf",
    trackingNumberOverlays: [
      // Right column "Waybill Number:" cell.
      { pageIndex: 0, x: 340, y: 705, fontSize: 11 },
    ],
    dateOverlays: [
      // Right column "Date:" cell — below waybill in the same cell.
      { pageIndex: 0, x: 340, y: 650, fontSize: 11, format: "iso" },
      // Bottom of Declaration Statement box — next to the "Date"
      // label under the M.B signature. Best-guess coords, iterate.
      { pageIndex: 0, x: 215, y: 30, fontSize: 10, format: "iso" },
    ],
    // Template is pre-signed by Armin ("M.B" at bottom of declaration
    // block) — no shipper signature overlay needed.
    signatureOverlay: undefined,
  },
  etdDocumentPaths: [],
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
    "Ambient FedEx Pak to Precision Epigenomics, Tucson AZ · International Priority",
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
  serviceType: "INTERNATIONAL_PRIORITY",
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
  commercialInvoice: {
    // Mike uploads: episeek-commercial-invoice.pdf (2 pages — CI on
    // page 1 with blank waybill+date, declaration on page 2 with
    // shipper signature line).
    templatePath: "episeek-commercial-invoice.pdf",
    trackingNumberOverlays: [
      { pageIndex: 0, x: 200, y: 700, fontSize: 11 },
    ],
    dateOverlays: [
      { pageIndex: 0, x: 200, y: 670, fontSize: 11, format: "iso" },
    ],
    signatureOverlay: {
      // Signature line is typically at the bottom of the declaration
      // (page 2 for EpiSeek's 2-page template).
      pageIndex: 1,
      x: 80,
      y: 130,
      width: 180,
      height: 45,
    },
  },
  etdDocumentPaths: [],
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
