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

const MAYO_LAB_NAME = "Mayo Clinic Laboratories";

/**
 * Counts orders that contain at least one Mayo Clinic test and do NOT
 * have a result record yet. This is the sidebar badge count for the
 * admin "Upload Results" link.
 */
export async function getPendingResultsCount(
  service: ServiceClient
): Promise<number> {
  // Fetch all non-cancelled orders with their order_lines (test lab) + results
  const { data } = await service
    .from("orders")
    .select(
      `
      id, status,
      order_lines(test:tests(lab:labs(name))),
      results(id)
    `
    )
    .neq("status", "cancelled");

  if (!data) return 0;

  type Row = {
    id: string;
    status: string;
    order_lines: Array<{
      test: { lab: { name: string } | { name: string }[] | null } | null;
    }>;
    results: Array<{ id: string }>;
  };

  let count = 0;
  for (const row of data as unknown as Row[]) {
    // Only count orders with Mayo tests
    const hasMayo = row.order_lines.some((ol) => {
      const lab = Array.isArray(ol.test?.lab)
        ? ol.test?.lab[0]
        : ol.test?.lab;
      return lab?.name === MAYO_LAB_NAME;
    });

    if (hasMayo && row.results.length === 0) {
      count += 1;
    }
  }

  return count;
}
