import { createServiceRoleClient } from "@/lib/supabase/server";
import { SupplementsManager } from "@/components/admin/SupplementsManager";
import type { Supplement } from "@/types/supplements";

export const dynamic = "force-dynamic";

export default async function AdminSupplementsPage() {
  const service = createServiceRoleClient();

  const { data: supplementsRaw } = await service
    .from("supplements")
    .select(
      `
      id, sku, name, description, price_cad, cost_cad,
      category, brand, active, featured,
      track_inventory, stock_qty, low_stock_threshold,
      image_url, created_at, updated_at
    `,
    )
    .order("name", { ascending: true });

  const supplements = (supplementsRaw ?? []) as unknown as Supplement[];

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <SupplementsManager initialSupplements={supplements} />
    </div>
  );
}
