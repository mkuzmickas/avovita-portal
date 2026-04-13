import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ManifestDetailClient } from "@/components/admin/ManifestDetailClient";
import type { Manifest, OrderStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export type ManifestOrderLine = {
  sku: string | null;
  cost_cad: number | null;
  unit_price_cad: number | null;
  fasting: boolean;
  is_primary_profile: boolean;
  first_name: string;
  last_name: string;
};

export type ManifestOrderRow = {
  id: string;
  status: OrderStatus;
  appointment_date: string | null;
  fedex_tracking_number: string | null;
  patient_name: string;
  lines: ManifestOrderLine[];
  cost_total: number | null;
  price_total: number | null;
};

export default async function AdminManifestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceRoleClient();

  const { data: manifestRaw } = await service
    .from("manifests")
    .select("id, name, ship_date, status, notes, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  const manifest = manifestRaw as Manifest | null;
  if (!manifest) notFound();

  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      `
      id, status, appointment_date, fedex_tracking_number,
      order_lines (
        unit_price_cad,
        test:tests ( sku, cost_cad, turnaround_display ),
        profile:patient_profiles ( first_name, last_name, is_primary )
      )
    `
    )
    .eq("manifest_id", id)
    .order("appointment_date", { ascending: true, nullsFirst: false });

  type RawLine = {
    unit_price_cad: number | null;
    test: {
      sku: string | null;
      cost_cad: number | null;
      turnaround_display: string | null;
    } | null;
    profile: {
      first_name: string | null;
      last_name: string | null;
      is_primary: boolean | null;
    } | null;
  };
  type RawOrder = {
    id: string;
    status: OrderStatus;
    appointment_date: string | null;
    fedex_tracking_number: string | null;
    order_lines: RawLine[];
  };

  const rows: ManifestOrderRow[] = ((ordersRaw ?? []) as unknown as RawOrder[]).map(
    (order) => {
      const lines: ManifestOrderLine[] = (order.order_lines ?? []).map((l) => ({
        sku: l.test?.sku ?? null,
        cost_cad: l.test?.cost_cad ?? null,
        unit_price_cad: l.unit_price_cad,
        fasting: /fasting/i.test(l.test?.turnaround_display ?? ""),
        is_primary_profile: !!l.profile?.is_primary,
        first_name: l.profile?.first_name ?? "",
        last_name: l.profile?.last_name ?? "",
      }));

      // Patient name = primary profile if present, else first line's profile
      const primary = lines.find((l) => l.is_primary_profile) ?? lines[0];
      const patientName = primary
        ? `${primary.last_name}, ${primary.first_name}`.trim()
        : "—";

      const cost_total = lines.reduce<number | null>(
        (acc, l) => (l.cost_cad == null ? acc : (acc ?? 0) + l.cost_cad),
        null
      );
      const price_total = lines.reduce<number | null>(
        (acc, l) => (l.unit_price_cad == null ? acc : (acc ?? 0) + l.unit_price_cad),
        null
      );

      return {
        id: order.id,
        status: order.status,
        appointment_date: order.appointment_date,
        fedex_tracking_number: order.fedex_tracking_number,
        patient_name: patientName,
        lines,
        cost_total,
        price_total,
      };
    }
  );

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <ManifestDetailClient manifest={manifest} initialOrders={rows} />
    </div>
  );
}
