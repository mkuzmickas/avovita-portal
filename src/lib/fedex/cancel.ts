/**
 * FedEx Cancel Shipment — voids a label created via /ship/v1/shipments.
 *
 * Works as long as the shipment hasn't been picked up / scanned yet.
 * After pickup, FedEx rejects the cancel and the label stays billable.
 * The portal UX makes this clear before firing.
 *
 * Docs: https://developer.fedex.com/api/en-us/catalog/ship/v1/docs.html#operation/Cancel%20Shipment
 */

import { readFedExConfig, getFedExAccessToken } from "./oauth";

export interface CancelShipmentResult {
  cancelled: boolean;
  /** FedEx's cancellation message, used in the UI when something goes
   *  wrong (e.g. "Package has already been picked up"). */
  message: string;
}

export async function cancelShipment(
  trackingNumber: string,
): Promise<CancelShipmentResult> {
  const config = readFedExConfig();
  const token = await getFedExAccessToken(config);

  // FedEx expects accountNumber as an object just like ship-create.
  const body = {
    accountNumber: { value: config.accountNumber },
    trackingNumber,
  };

  const res = await fetch(`${config.apiUrl}/ship/v1/shipments/cancel`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-locale": "en_US",
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  if (!res.ok) {
    // FedEx returns the error payload as JSON with an `errors[]` array
    // on non-200 responses. Pull the first readable message.
    let msg = `FedEx cancel failed (${res.status})`;
    try {
      const parsed = JSON.parse(responseText) as {
        errors?: Array<{ message?: string; code?: string }>;
      };
      const first = parsed.errors?.[0];
      if (first?.message) msg = first.message;
    } catch {
      msg = responseText.slice(0, 400);
    }
    return { cancelled: false, message: msg };
  }

  // Successful cancel returns { output: { cancelledShipment: true, message } }
  try {
    const data = JSON.parse(responseText) as {
      output?: { cancelledShipment?: boolean; message?: string };
    };
    return {
      cancelled: data.output?.cancelledShipment ?? true,
      message: data.output?.message ?? "Shipment cancelled.",
    };
  } catch {
    return { cancelled: true, message: "Shipment cancelled." };
  }
}
