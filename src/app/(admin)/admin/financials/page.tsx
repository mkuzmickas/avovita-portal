import { createServiceRoleClient } from "@/lib/supabase/server";
import { FinancialsClient } from "@/components/admin/FinancialsClient";
import type { Expense, ManifestStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export type ShippedOrder = {
  id: string;
  shipped_at: string;
  total_cad: number;
  test_cost_cad: number;
  test_count: number;
  manifest_id: string | null;
};

export type ManifestSummary = {
  id: string;
  name: string;
  ship_date: string;
  status: ManifestStatus;
  orders_count: number;
  tests_count: number;
  revenue: number;
  test_cost: number;
};

export default async function AdminFinancialsPage() {
  const service = createServiceRoleClient();

  // 1. Pull eligible orders from the last 365 days
  const cutoffIso = new Date(
    Date.now() - 365 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      `
      id, shipped_at, total_cad, manifest_id,
      order_lines (
        quantity,
        test:tests ( cost_cad )
      )
    `
    )
    .in("status", ["shipped", "resulted", "complete"])
    .not("shipped_at", "is", null)
    .gte("shipped_at", cutoffIso);

  type RawOrder = {
    id: string;
    shipped_at: string;
    total_cad: number | null;
    manifest_id: string | null;
    order_lines: Array<{
      quantity: number;
      test: { cost_cad: number | null } | null;
    }>;
  };

  const orders: ShippedOrder[] = ((ordersRaw ?? []) as unknown as RawOrder[]).map(
    (o) => {
      let testCost = 0;
      let testCount = 0;
      for (const line of o.order_lines ?? []) {
        const cost = line.test?.cost_cad ?? 0;
        const qty = line.quantity ?? 1;
        testCost += cost * qty;
        testCount += qty;
      }
      return {
        id: o.id,
        shipped_at: o.shipped_at,
        total_cad: o.total_cad ?? 0,
        test_cost_cad: testCost,
        test_count: testCount,
        manifest_id: o.manifest_id,
      };
    }
  );

  // 2. Manifests with aggregates
  const { data: manifestsRaw } = await service
    .from("manifests")
    .select("id, name, ship_date, status")
    .order("ship_date", { ascending: false });

  type RawManifest = {
    id: string;
    name: string;
    ship_date: string;
    status: ManifestStatus;
  };

  const manifests: ManifestSummary[] = (
    (manifestsRaw ?? []) as unknown as RawManifest[]
  ).map((m) => {
    const inManifest = orders.filter((o) => o.manifest_id === m.id);
    return {
      id: m.id,
      name: m.name,
      ship_date: m.ship_date,
      status: m.status,
      orders_count: inManifest.length,
      tests_count: inManifest.reduce((s, o) => s + o.test_count, 0),
      revenue: inManifest.reduce((s, o) => s + o.total_cad, 0),
      test_cost: inManifest.reduce((s, o) => s + o.test_cost_cad, 0),
    };
  });

  // 3. Expenses
  const { data: expensesRaw } = await service
    .from("expenses")
    .select("id, name, amount_cad, category, frequency, active, notes, created_at")
    .order("created_at", { ascending: false });
  const expenses = (expensesRaw ?? []) as unknown as Expense[];

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
          <span style={{ color: "#c4973a" }}>Financials</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Revenue, costs, and operating expenses across the business.
        </p>
      </div>

      <FinancialsClient
        orders={orders}
        manifests={manifests}
        initialExpenses={expenses}
      />
    </div>
  );
}
