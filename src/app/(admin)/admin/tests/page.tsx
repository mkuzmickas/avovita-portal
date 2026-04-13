import { createServiceRoleClient } from "@/lib/supabase/server";
import { TestsManager } from "@/components/admin/TestsManager";
import type { Test, Lab } from "@/types/database";

export const dynamic = "force-dynamic";

export type AdminTestRow = Test & {
  lab: Pick<Lab, "id" | "name">;
  track_inventory: boolean | null;
  stock_qty: number | null;
  low_stock_threshold: number | null;
  sku: string | null;
  cost_cad: number | null;
  mayo_test_id: string | null;
};

export type AdminLabRow = Pick<Lab, "id" | "name">;

export default async function AdminTestsPage() {
  const service = createServiceRoleClient();

  const [{ data: testsRaw }, { data: labsRaw }] = await Promise.all([
    service
      .from("tests")
      .select(
        `
        id, lab_id, name, slug, description, category, price_cad,
        turnaround_display, turnaround_min_days, turnaround_max_days,
        turnaround_note, specimen_type, ship_temp,
        stability_notes, active, featured, created_at, updated_at,
        track_inventory, stock_qty, low_stock_threshold,
        sku, cost_cad, mayo_test_id,
        lab:labs(id, name)
      `
      )
      .order("name", { ascending: true }),
    service.from("labs").select("id, name").order("name", { ascending: true }),
  ]);

  type RawTest = Omit<AdminTestRow, "lab"> & {
    lab: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const tests: AdminTestRow[] = ((testsRaw ?? []) as unknown as RawTest[]).map(
    (row) => {
      const lab = Array.isArray(row.lab) ? row.lab[0] : row.lab;
      return {
        ...row,
        lab: lab ?? { id: row.lab_id, name: "—" },
      } as AdminTestRow;
    }
  );

  const labs = (labsRaw ?? []) as AdminLabRow[];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>Tests</span>
          </h1>
          <p className="mt-1" style={{ color: "#e8d5a3" }}>
            Catalogue management — edit, activate, and feature tests.
          </p>
        </div>
        <div
          className="rounded-lg border px-4 py-2"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <p className="text-xs" style={{ color: "#6ab04c" }}>
            Total Tests
          </p>
          <p className="text-xl font-semibold" style={{ color: "#c4973a" }}>
            {tests.length}
          </p>
        </div>
      </div>

      <TestsManager initialTests={tests} labs={labs} />
    </div>
  );
}
