/**
 * Defaults + saved addresses for the "Book a Pickup" console section.
 *
 * FedEx pickup requests specify a ready time (when the package will be
 * out for pickup) and a customer close time (latest FedEx can arrive).
 * Standard AvoVita pattern: 3 PM ready, 5 PM close = 2-hour window.
 *
 * Times are all Calgary local (America/Edmonton) — the API caller
 * converts to ISO 8601 with the correct DST-aware offset.
 */

export interface SavedPickupAddress {
  key: string;
  displayLabel: string;
  contactName: string;
  companyName: string | null;
  phone: string;
  streetLines: string[];
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
  residential: boolean;
}

export const SAVED_PICKUP_ADDRESSES: SavedPickupAddress[] = [
  {
    key: "shawfield",
    displayLabel: "Home — 137 Shawfield Bay SW, Calgary AB T2Y 2W4",
    contactName: "Mike Kuzmickas",
    companyName: "AvoVita Wellness",
    phone: "4038633933",
    streetLines: ["137 Shawfield Bay SW"],
    city: "Calgary",
    stateOrProvince: "AB",
    postalCode: "T2Y2W4",
    country: "CA",
    residential: true,
  },
];

/** Standard pickup window defaults. */
export const PICKUP_DEFAULTS = {
  readyTime: "15:00", // 3 PM Calgary
  closeTime: "17:00", // 5 PM Calgary
  packageCount: 1,
  totalWeightLb: 15,
  packageLocation: "FRONT" as const,
  carrierCode: "FDXE" as const, // FedEx Express
  commodityDescription: "Human specimens for diagnostic purposes",
  notificationEmail: "mike@avovita.ca",
};
