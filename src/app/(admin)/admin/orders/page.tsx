import { createServiceRoleClient } from "@/lib/supabase/server";
import { AdminOrdersTable } from "@/components/admin/AdminOrdersTable";
import type { OrderStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export type AdminOrderRow = {
  id: string;
  status: OrderStatus;
  total_cad: number | null;
  subtotal_cad: number | null;
  discount_cad: number | null;
  created_at: string;
  account: { id: string; email: string | null } | null;
  order_lines: Array<{
    id: string;
    test: { name: string } | null;
    profile: {
      id: string;
      first_name: string;
      last_name: string;
    } | null;
  }>;
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ patient_id?: string }>;
}) {
  const params = await searchParams;
  const patientId = params.patient_id;

  const service = createServiceRoleClient();

  let query = service
    .from("orders")
    .select(
      `
      id, status, total_cad, subtotal_cad, discount_cad, created_at,
      account:accounts(id, email),
      order_lines(
        id,
        test:tests(name),
        profile:patient_profiles(id, first_name, last_name)
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(500);

  // When filtering by patient, match by account_id (the cart-owning account)
  if (patientId) {
    query = query.eq("account_id", patientId);
  }

  const { data: ordersRaw } = await query;
  const orders = (ordersRaw ?? []) as unknown as AdminOrderRow[];

  // Resolve patient label for the "filtered by patient" banner
  let patientBannerLabel: string | null = null;
  if (patientId) {
    const { data: profile } = await service
      .from("patient_profiles")
      .select("first_name, last_name")
      .eq("account_id", patientId)
      .eq("is_primary", true)
      .maybeSingle();
    const p = profile as { first_name: string; last_name: string } | null;
    if (p) patientBannerLabel = `${p.first_name} ${p.last_name}`;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>Orders</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Manage and update status for all patient orders.
        </p>
      </div>

      <AdminOrdersTable
        orders={orders}
        patientFilter={
          patientBannerLabel
            ? { label: patientBannerLabel, accountId: patientId! }
            : null
        }
      />
    </div>
  );
}
