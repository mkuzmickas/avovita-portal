import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import {
  ExpandableOrderCard,
  type PortalOrder,
} from "@/components/portal/ExpandableOrderCard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/portal/orders");

  const { data: ordersRaw } = await supabase
    .from("orders")
    .select(
      `
      id, status, total_cad, subtotal_cad, home_visit_fee_cad, notes, created_at,
      order_lines(
        id, quantity, unit_price_cad,
        test:tests(
          name, specimen_type, turnaround_display,
          lab:labs(name)
        ),
        profile:patient_profiles(first_name, last_name)
      )
    `
    )
    .eq("account_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (ordersRaw ?? []) as unknown as PortalOrder[];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1
          className="font-heading text-3xl sm:text-4xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          My <span style={{ color: "#c4973a" }}>Orders</span>
        </h1>
        <p className="mt-1 text-sm sm:text-base" style={{ color: "#e8d5a3" }}>
          Track all your lab test orders and book your home visit.
        </p>
      </div>

      {orders.length === 0 ? (
        <div
          className="rounded-xl border px-6 py-16 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <Package
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "#2d6b35" }}
          />
          <p style={{ color: "#6ab04c" }}>No orders yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <ExpandableOrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
