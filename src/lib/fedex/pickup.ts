import { readFedExConfig, getFedExAccessToken } from "./oauth";
import type { SavedPickupAddress } from "@/lib/config/pickup";

/**
 * FedEx Pickup API — schedules a courier pickup at a given address and
 * time window. Returns a confirmation code that FedEx uses to track
 * the pickup request; if pickup needs to be rescheduled or cancelled
 * later, that code is what identifies it.
 *
 * FedEx REST API docs:
 *   https://developer.fedex.com/api/en-us/catalog/pickup/v1/docs.html
 *
 * Requests must be submitted at least ~1 hour before the ready time,
 * and the ready-to-close window must be at least 2 hours long.
 */

export interface PickupBookingParams {
  address: SavedPickupAddress;
  /** Local date at pickup location, YYYY-MM-DD. */
  date: string;
  /** Local time at pickup location, HH:MM (24h). Package ready. */
  readyTime: string;
  /** Local time at pickup location, HH:MM (24h). Latest for pickup. */
  closeTime: string;
  packageCount: number;
  totalWeightLb: number;
  packageLocation:
    | "FRONT"
    | "NONE"
    | "OTHER"
    | "REAR"
    | "SIDE"
    | "IN/AT_MAILBOX";
  carrierCode: "FDXE" | "FDXG"; // Express or Ground
  commodityDescription: string;
  notificationEmail: string;
}

export interface PickupBookingResult {
  confirmationCode: string;
  scheduledDate: string;
  location: string | null;
  raw: unknown;
}

export async function bookPickup(
  params: PickupBookingParams,
): Promise<PickupBookingResult> {
  const config = readFedExConfig();
  const token = await getFedExAccessToken(config);

  const readyTimestamp = buildCalgaryTimestamp(params.date, params.readyTime);
  const requestBody = {
    associatedAccountNumber: { value: config.accountNumber },
    originDetail: {
      pickupLocation: {
        contact: {
          personName: params.address.contactName,
          phoneNumber: params.address.phone,
          companyName: params.address.companyName ?? undefined,
        },
        address: {
          streetLines: params.address.streetLines,
          city: params.address.city,
          stateOrProvinceCode: params.address.stateOrProvince,
          postalCode: params.address.postalCode,
          countryCode: params.address.country,
          residential: params.address.residential,
        },
      },
      readyDateTimestamp: readyTimestamp,
      customerCloseTime: `${params.closeTime}:00`,
      packageLocation: params.packageLocation,
    },
    totalWeight: {
      units: "LB",
      value: params.totalWeightLb,
    },
    packageCount: params.packageCount,
    carrierCode: params.carrierCode,
    commodityDescription: params.commodityDescription,
    remarks: "AvoVita Wellness scheduled pickup",
    pickupNotificationDetail: {
      emailDetails: [
        {
          address: params.notificationEmail,
          locale: "en_US",
        },
      ],
      format: "TEXT",
      userMessage: "",
    },
  };

  const res = await fetch(`${config.apiUrl}/pickup/v1/pickups`, {
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
      `FedEx Pickup API failed (${res.status}): ${responseText.slice(0, 1000)}`,
    );
  }

  const data = JSON.parse(responseText) as {
    output?: {
      pickupConfirmationCode?: string;
      scheduleDate?: string;
      location?: string;
    };
  };

  const confirmationCode = data.output?.pickupConfirmationCode;
  if (!confirmationCode) {
    throw new Error(
      `FedEx Pickup response missing confirmation code: ${responseText.slice(0, 500)}`,
    );
  }

  return {
    confirmationCode,
    scheduledDate: data.output?.scheduleDate ?? params.date,
    location: data.output?.location ?? null,
    raw: data,
  };
}

/**
 * Build an ISO 8601 timestamp for a Calgary local time, using the
 * correct MST/MDT offset for that specific date. Uses Intl API so
 * DST transitions are handled automatically without a date library.
 */
function buildCalgaryTimestamp(dateStr: string, timeStr: string): string {
  // Anchor on the requested local time — noon UTC on the same date is
  // safe (both MDT and MST land on the same calendar day).
  const anchor = new Date(`${dateStr}T12:00:00Z`);
  const offset = getCalgaryOffsetString(anchor);
  return `${dateStr}T${timeStr}:00${offset}`;
}

function getCalgaryOffsetString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value;
  // raw is like "GMT-06:00" (MDT) or "GMT-07:00" (MST) — strip prefix.
  if (raw?.startsWith("GMT")) return raw.slice(3) || "-06:00";
  return "-06:00"; // Sane fallback if Intl doesn't return longOffset
}
