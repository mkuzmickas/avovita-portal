import { createServiceRoleClient } from "@/lib/supabase/server";
import { ManifestsManager } from "@/components/admin/ManifestsManager";
import type { Manifest } from "@/types/database";

export const dynamic = "force-dynamic";

export type ManifestWithCount = Manifest & { order_count: number };

export default async function AdminManifestsPage() {
  const service = createServiceRoleClient();

  const { data: manifestsRaw } = await service
    .from("manifests")
    .select("id, name, ship_date, status, notes, created_at, updated_at")
    .order("ship_date", { ascending: false });

  const manifests = (manifestsRaw ?? []) as unknown as Manifest[];

  // Per-manifest order counts via a single grouped query
  const ids = manifests.map((m) => m.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: orderRows } = await service
      .from("orders")
      .select("manifest_id")
      .in("manifest_id", ids);
    for (const row of (orderRows ?? []) as { manifest_id: string }[]) {
      counts.set(row.manifest_id, (counts.get(row.manifest_id) ?? 0) + 1);
    }
  }

  const withCounts: ManifestWithCount[] = manifests.map((m) => ({
    ...m,
    order_count: counts.get(m.id) ?? 0,
  }));

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>Manifests</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Group orders by ship date to streamline FedEx pickups and lab
          submissions.
        </p>
      </div>

      <ManifestsManager initialManifests={withCounts} />
    </div>
  );
}
