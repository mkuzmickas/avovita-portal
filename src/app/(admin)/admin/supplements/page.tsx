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
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>Supplements</span>
          </h1>
          <p className="mt-1" style={{ color: "#e8d5a3" }}>
            Inventory management — add, edit, and track supplement stock.
          </p>
        </div>
        <div
          className="rounded-lg border px-4 py-2"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <p className="text-xs" style={{ color: "#6ab04c" }}>
            Total Supplements
          </p>
          <p className="text-xl font-semibold" style={{ color: "#c4973a" }}>
            {supplements.length}
          </p>
        </div>
      </div>

      <SupplementsManager initialSupplements={supplements} />
    </div>
  );
}
