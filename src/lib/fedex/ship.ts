/**
 * FedEx Ship API — creates an international shipment with
 * dangerous-goods (dry ice) declaration and returns the label +
 * commercial invoice + tracking number.
 *
 * FedEx REST API docs: https://developer.fedex.com/api/en-us/catalog/ship/v1/docs.html
 *
 * The request payload is large but follows a predictable shape:
 * shipper → recipient → package(s) → customs → service options.
 * We build it from a ShippingProfile so callers only pass profile
 * kind + optional overrides.
 *
 * Returns the label PDF as a base64-encoded string (FedEx serves
 * labels inline in the API response) plus the master tracking
 * number. Persist the label bytes to Supabase Storage so the URL
 * doesn't expire when FedEx rotates its label CDN.
 */

import { readFedExConfig, getFedExAccessToken } from "./oauth";
import type { ShippingProfile } from "@/lib/config/shipping-profiles";
import { SHIPPER } from "@/lib/config/shipping-profiles";

// ─── Response types (minimal — we don't parse the whole shape) ───
export interface ShipmentDocument {
  /** FedEx document type — COMMERCIAL_INVOICE, PRO_FORMA_INVOICE, etc. */
  contentType: string;
  /** How many copies FedEx expects the shipper to print + include
   *  in the FedEx pouch. Typically 3 for commercial invoice. */
  copiesToPrint: number;
  pdfBase64: string;
}

export interface ShipApiResult {
  trackingNumber: string;
  labelPdfBase64: string;
  /** Additional documents FedEx returned (e.g. auto-generated
   *  commercial invoice). */
  additionalDocs: ShipmentDocument[];
  /** Raw response for debugging / auditing. */
  raw: unknown;
}

// Extra customs paperwork (CDC permits, proforma invoice, declaration)
// is printed manually alongside the label — FedEx auto-generates the
// commercial invoice from commodity data, which satisfies customs
// electronically. See the route for how the extra PDFs are surfaced
// as download links.

/**
 * Create the actual shipment. Returns the tracking number + label
 * PDF bytes ready to persist and print.
 */
export async function createShipment(params: {
  profile: ShippingProfile;
  /** Optional per-shipment override — free-text on the airway bill. */
  reference?: string;
}): Promise<ShipApiResult> {
  const config = readFedExConfig();
  const token = await getFedExAccessToken(config);

  const { profile, reference } = params;

  const requestBody = buildShipRequest({
    profile,
    accountNumber: config.accountNumber,
    reference,
  });

  const res = await fetch(`${config.apiUrl}/ship/v1/shipments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-locale": "en_US",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(
      `FedEx Ship API failed (${res.status}) [${profile.kind}]: ${responseText.slice(0, 1000)}`,
    );
  }

  const data = JSON.parse(responseText) as ShipApiResponse;
  return extractResult(data);
}

// ─── Request builder ─────────────────────────────────────────────
// Kept as a plain function so we can unit-test the payload shape
// without hitting the network. Every field is derived from the
// profile or the account number — no hidden env reads inside here.
function buildShipRequest(params: {
  profile: ShippingProfile;
  accountNumber: string;
  reference?: string;
}): Record<string, unknown> {
  const { profile, accountNumber, reference } = params;
  const now = new Date();

  const shipperFedEx = {
    contact: {
      personName: SHIPPER.contactName,
      companyName: SHIPPER.company,
      phoneNumber: SHIPPER.phone,
      emailAddress: SHIPPER.email,
    },
    address: {
      streetLines: [SHIPPER.address.line1, SHIPPER.address.line2].filter(
        Boolean,
      ) as string[],
      city: SHIPPER.address.city,
      stateOrProvinceCode: SHIPPER.address.stateOrProvince,
      postalCode: SHIPPER.address.postalCode,
      countryCode: SHIPPER.address.country,
      residential: SHIPPER.residential,
    },
  };

  const recipientFedEx = {
    contact: {
      personName: profile.recipient.contactName,
      companyName: profile.recipient.company ?? undefined,
      phoneNumber: profile.recipient.phone,
      emailAddress: profile.recipient.email ?? undefined,
    },
    address: {
      streetLines: [
        profile.recipient.address.line1,
        profile.recipient.address.line2,
      ].filter(Boolean) as string[],
      city: profile.recipient.address.city,
      stateOrProvinceCode: profile.recipient.address.stateOrProvince,
      postalCode: profile.recipient.address.postalCode,
      countryCode: profile.recipient.address.country,
      residential: profile.recipient.residential,
    },
  };

  const dangerousGoodsBlock =
    profile.package.dryIceWeightKg > 0
      ? {
          packageSpecialServices: {
            specialServiceTypes: ["DRY_ICE"],
            dryIceWeight: {
              units: "KG",
              value: profile.package.dryIceWeightKg,
            },
          },
        }
      : {};

  // FedEx-branded packagings (FEDEX_PAK / FEDEX_ENVELOPE / etc.)
  // don't require dimensions — FedEx uses standard sizes internally.
  // YOUR_PACKAGING does require them.
  const hasDims =
    profile.package.lengthIn != null &&
    profile.package.widthIn != null &&
    profile.package.heightIn != null;
  const packageLineItem: Record<string, unknown> = {
    weight: {
      units: profile.package.weightUnit,
      value: profile.package.weightLb,
    },
    declaredValue: {
      amount: profile.package.declaredValue,
      currency: profile.currency,
    },
    ...dangerousGoodsBlock,
  };
  if (hasDims) {
    packageLineItem.dimensions = {
      length: profile.package.lengthIn,
      width: profile.package.widthIn,
      height: profile.package.heightIn,
      units: profile.package.dimensionUnit,
    };
  }

  const customsCommodity = {
    description: profile.commodity.description,
    quantity: profile.commodity.quantity,
    quantityUnits: profile.commodity.quantityUnit,
    weight: {
      units: "LB",
      value: profile.commodity.netWeightLb,
    },
    customsValue: {
      amount: profile.commodity.customsValue,
      currency: profile.currency,
    },
    unitPrice: {
      amount: profile.commodity.customsValue / profile.commodity.quantity,
      currency: profile.currency,
    },
    numberOfPieces: profile.commodity.quantity,
    countryOfManufacture: profile.commodity.countryOfManufacture,
    harmonizedCode: profile.commodity.harmonizedCode,
  };

  const dutiesPaymentBlock =
    profile.dutiesPaidBy === "SENDER"
      ? {
          paymentType: "SENDER",
          payor: {
            responsibleParty: {
              accountNumber: { value: accountNumber },
            },
          },
        }
      : {
          paymentType: "RECIPIENT",
        };

  const customsClearanceDetail: Record<string, unknown> = {
    dutiesPayment: dutiesPaymentBlock,
    isDocumentOnly: false,
    commercialInvoice: {
      shipmentPurpose: profile.shipmentPurpose,
      termsOfSale: profile.incoterm,
    },
    commodities: [customsCommodity],
  };

  // Electronic Trade Documents (ETD) — request FedEx to auto-generate
  // the commercial invoice from the commodity data above and transmit
  // it electronically to customs. Two blocks are required together:
  //   1. shipmentSpecialServices.etdDetail.requestedDocumentCopies
  //      declares which docs FedEx should transmit electronically.
  //   2. shippingDocumentSpecification tells FedEx how to format
  //      the auto-generated doc (PDF, letter-size). Without this
  //      the ETD request fails with SHIPPING.DOCUMENT.REQUIRED.
  // Extra recipient customs paperwork (CDC permits, proforma,
  // declaration) is not attached here — it's downloaded from the
  // shipping console and printed alongside the label.
  const etdBlock = {
    shipmentSpecialServices: {
      specialServiceTypes: ["ELECTRONIC_TRADE_DOCUMENTS"],
      etdDetail: {
        requestedDocumentCopies: ["COMMERCIAL_INVOICE"],
      },
    },
    shippingDocumentSpecification: {
      shippingDocumentTypes: ["COMMERCIAL_INVOICE"],
      commercialInvoiceDetail: {
        documentFormat: {
          docType: "PDF",
          stockType: "PAPER_LETTER",
        },
      },
    },
  };

  const emailNotifications = {
    emailNotificationDetail: {
      aggregationType: "PER_SHIPMENT",
      emailNotificationRecipients: [
        {
          name: profile.recipient.contactName,
          emailNotificationRecipientType: "RECIPIENT",
          emailAddress: profile.recipientNotifications.email,
          notificationFormatType: "TEXT",
          notificationType: "EMAIL",
          locale: "en_US",
          notificationEventType: profile.recipientNotifications.events,
        },
      ],
    },
  };

  const requestedShipment: Record<string, unknown> = {
    shipper: shipperFedEx,
    recipients: [recipientFedEx],
    shipDatestamp: now.toISOString().slice(0, 10),
    serviceType: profile.serviceType,
    packagingType: profile.package.packagingType,
    pickupType: "USE_SCHEDULED_PICKUP",
    blockInsightVisibility: false,
    labelSpecification: {
      imageType: "PDF",
      labelStockType: "PAPER_85X11_TOP_HALF_LABEL",
    },
    shippingChargesPayment: {
      paymentType: "SENDER",
      payor: {
        responsibleParty: {
          accountNumber: {
            value: accountNumber,
          },
        },
      },
    },
    customsClearanceDetail,
    ...etdBlock,
    ...emailNotifications,
    totalPackageCount: 1,
    totalWeight: profile.package.weightLb,
    requestedPackageLineItems: [packageLineItem],
  };

  if (reference) {
    (packageLineItem as Record<string, unknown>).customerReferences = [
      { customerReferenceType: "CUSTOMER_REFERENCE", value: reference },
    ];
  }

  return {
    labelResponseOptions: "LABEL",
    requestedShipment,
    accountNumber: {
      value: accountNumber,
    },
  };
}

// ─── Response parsing ────────────────────────────────────────────
interface ShipApiResponse {
  output?: {
    transactionShipments?: Array<{
      masterTrackingNumber?: string;
      pieceResponses?: Array<{
        packageDocuments?: Array<{
          contentType?: string;
          docType?: string;
          encodedLabel?: string;
        }>;
      }>;
      shipmentDocuments?: Array<{
        contentType?: string;
        docType?: string;
        copiesToPrint?: number;
        encodedLabel?: string;
      }>;
    }>;
  };
}

function extractResult(response: ShipApiResponse): ShipApiResult {
  const shipment = response.output?.transactionShipments?.[0];
  if (!shipment) {
    throw new Error(
      `FedEx Ship response missing transactionShipments: ${JSON.stringify(response).slice(0, 500)}`,
    );
  }

  const trackingNumber = shipment.masterTrackingNumber;
  if (!trackingNumber) {
    throw new Error(
      `FedEx Ship response missing masterTrackingNumber: ${JSON.stringify(response).slice(0, 500)}`,
    );
  }

  const packageDocs = shipment.pieceResponses?.[0]?.packageDocuments ?? [];
  const labelDoc = packageDocs.find(
    (d) => d.contentType?.toLowerCase() === "label" || d.docType?.toLowerCase() === "label",
  ) ?? packageDocs[0];
  const labelPdfBase64 = labelDoc?.encodedLabel ?? "";

  // In FedEx's schema: contentType = document type
  // (COMMERCIAL_INVOICE), docType = file format (PDF). We record
  // contentType because the shipper cares about the doc, not the
  // format. copiesToPrint defaults to 3 for CI — falls back if the
  // API omits it.
  const additionalDocs: ShipmentDocument[] = (shipment.shipmentDocuments ?? []).map((d) => ({
    contentType: d.contentType ?? "UNKNOWN",
    copiesToPrint: d.copiesToPrint ?? 3,
    pdfBase64: d.encodedLabel ?? "",
  }));

  return {
    trackingNumber,
    labelPdfBase64,
    additionalDocs,
    raw: response,
  };
}
