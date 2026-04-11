import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Sentinel storage_path marker for "Mark as Notified" entries created for
 * labs with results_visibility='none' (Dynacare, ReligenDx, Precision
 * Epigenomics). These rows satisfy the NOT NULL schema constraint on
 * results.storage_path / file_name without actually uploading a PDF.
 * The patient portal filters these out from the visible results list.
 */
export const DIRECT_DELIVERY_SENTINEL = "__direct_delivery__";

/**
 * Counts order lines that still require admin action:
 *   - no result record yet
 *   - parent order is not cancelled
 *
 * Includes order lines whose lab has results_visibility='none' — those
 * still need the admin to click "Mark as Notified", so they count as
 * pending from a workflow perspective.
 */
export async function getPendingResultsCount(
  service: ServiceClient
): Promise<number> {
  const { data } = await service.from("order_lines").select(`
      id,
      order:orders(status),
      result:results(id)
    `);

  if (!data) return 0;

  type Row = {
    id: string;
    order: { status: string } | null;
    result: Array<{ id: string }>;
  };

  let count = 0;
  for (const row of data as unknown as Row[]) {
    if (row.order?.status === "cancelled") continue;
    if (row.result.length === 0) count += 1;
  }
  return count;
}

/**
 * Returns the set of order_line IDs that currently have at least one
 * result row. Used to filter "pending upload" lists without the fragile
 * `not in (subquery string)` pattern.
 */
export async function getOrderLineIdsWithResults(
  service: ServiceClient
): Promise<Set<string>> {
  const { data } = await service.from("results").select("order_line_id");
  if (!data) return new Set();
  return new Set(
    (data as unknown as Array<{ order_line_id: string }>).map(
      (r) => r.order_line_id
    )
  );
}
