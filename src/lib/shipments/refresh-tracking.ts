import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTrackingStatuses } from "@/lib/fedex/track";

/**
 * Refresh tracking status for manual_shipments that need it.
 *
 * Called from the /shipping page server component on load. To keep
 * page loads snappy and stay under FedEx's Tracking API budget:
 *   - Skip anything already marked delivered (final state).
 *   - Skip anything sandbox-flagged (FedEx sandbox tracking is
 *     unreliable — Ship API generates tracking numbers that the
 *     Track API doesn't know about).
 *   - Skip anything refreshed within the last STALENESS_WINDOW_MS.
 *   - Never block page render if FedEx is down — swallow errors.
 *
 * Returns nothing — caller re-reads the table to get the updated
 * status. Keeps this function's side effects self-contained.
 */

const STALENESS_WINDOW_MS = 10 * 60 * 1000; // 10 min

export async function refreshShipmentTracking(
  supabase: SupabaseClient,
  shipmentIds: string[],
): Promise<void> {
  if (shipmentIds.length === 0) return;

  const { data: rows, error } = await supabase
    .from("manual_shipments")
    .select(
      "id, tracking_number, delivered_at, status_fetched_at, environment",
    )
    .in("id", shipmentIds);
  if (error || !rows) return;

  const now = Date.now();
  const stale = (rows as Array<{
    id: string;
    tracking_number: string;
    delivered_at: string | null;
    status_fetched_at: string | null;
    environment: string;
  }>).filter((r) => {
    if (!r.tracking_number) return false;
    if (r.environment === "sandbox") return false; // FedEx sandbox tracking is unreliable
    if (r.delivered_at) return false; // Terminal state
    if (!r.status_fetched_at) return true;
    return now - new Date(r.status_fetched_at).getTime() > STALENESS_WINDOW_MS;
  });

  if (stale.length === 0) return;

  let statuses;
  try {
    statuses = await fetchTrackingStatuses(stale.map((s) => s.tracking_number));
  } catch (err) {
    console.warn(
      "[refresh-tracking] FedEx Tracking API failed — page continues with stale data:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  const byTn = new Map(statuses.map((s) => [s.trackingNumber, s]));
  const fetchedAt = new Date(now).toISOString();

  await Promise.all(
    stale.map(async (row) => {
      const st = byTn.get(row.tracking_number);
      if (!st) return;
      const update: Record<string, unknown> = {
        tracking_status_code: st.statusCode,
        tracking_status_description: st.statusDescription,
        status_fetched_at: fetchedAt,
      };
      if (st.deliveredAt && !row.delivered_at) {
        update.delivered_at = st.deliveredAt;
      }
      await supabase.from("manual_shipments").update(update).eq("id", row.id);
    }),
  );
}
