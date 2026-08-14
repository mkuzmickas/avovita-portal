import { readFedExConfig, getFedExAccessToken } from "./oauth";

/**
 * FedEx Tracking API — batch lookup of shipment status.
 *
 * Docs: https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html
 *
 * Batch endpoint accepts up to 30 tracking numbers per request. We
 * only need "latest status" here (not the full scan history) so we
 * pass includeDetailedScans:false to keep the response small.
 */

export interface TrackingStatus {
  trackingNumber: string;
  /** FedEx status code: DL=delivered, IT=in transit, OD=out for delivery,
   *  PU=picked up, OC=order created (label made but not yet in FedEx
   *  possession), DE=delivery exception, RS=returned to shipper, etc. */
  statusCode: string;
  statusDescription: string;
  /** ISO 8601 timestamp if delivered, else null. */
  deliveredAt: string | null;
}

const BATCH_LIMIT = 30;

export async function fetchTrackingStatuses(
  trackingNumbers: string[],
): Promise<TrackingStatus[]> {
  if (trackingNumbers.length === 0) return [];

  const config = readFedExConfig();
  const token = await getFedExAccessToken(config);

  const results: TrackingStatus[] = [];
  // Chunk into batches of 30 (FedEx max per request).
  for (let i = 0; i < trackingNumbers.length; i += BATCH_LIMIT) {
    const batch = trackingNumbers.slice(i, i + BATCH_LIMIT);
    const batchResults = await fetchOneBatch(config.apiUrl, token, batch);
    results.push(...batchResults);
  }
  return results;
}

async function fetchOneBatch(
  apiUrl: string,
  token: string,
  trackingNumbers: string[],
): Promise<TrackingStatus[]> {
  const body = {
    trackingInfo: trackingNumbers.map((tn) => ({
      trackingNumberInfo: { trackingNumber: tn },
    })),
    includeDetailedScans: false,
  };

  const res = await fetch(`${apiUrl}/track/v1/trackingnumbers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-locale": "en_US",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `FedEx Tracking API failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as {
    output?: {
      completeTrackResults?: Array<{
        trackingNumber?: string;
        trackResults?: Array<{
          trackingNumberInfo?: { trackingNumber?: string };
          latestStatusDetail?: {
            code?: string;
            derivedCode?: string;
            description?: string;
            statusByLocale?: string;
          };
          dateAndTimes?: Array<{
            type?: string;
            dateTime?: string;
          }>;
          error?: {
            code?: string;
            message?: string;
          };
        }>;
      }>;
    };
  };

  const out: TrackingStatus[] = [];
  for (const complete of data.output?.completeTrackResults ?? []) {
    for (const track of complete.trackResults ?? []) {
      const tn =
        track.trackingNumberInfo?.trackingNumber ?? complete.trackingNumber;
      if (!tn) continue;

      // If FedEx flagged this tracking # as error (e.g. not found yet),
      // surface a synthetic "pending" status so callers can differentiate
      // from unknown-code shipments.
      if (track.error) {
        out.push({
          trackingNumber: tn,
          statusCode: "PENDING",
          statusDescription: track.error.message ?? "Awaiting FedEx pickup",
          deliveredAt: null,
        });
        continue;
      }

      const statusCode =
        track.latestStatusDetail?.code ??
        track.latestStatusDetail?.derivedCode ??
        "UNKNOWN";
      const statusDescription =
        track.latestStatusDetail?.description ??
        track.latestStatusDetail?.statusByLocale ??
        "Unknown";
      const deliveredEntry = track.dateAndTimes?.find(
        (d) => d.type === "ACTUAL_DELIVERY",
      );
      out.push({
        trackingNumber: tn,
        statusCode,
        statusDescription,
        deliveredAt: deliveredEntry?.dateTime ?? null,
      });
    }
  }
  return out;
}
