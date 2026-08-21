import { createServiceRoleClient } from "@/lib/supabase/server";
import { FinancialsClient } from "@/components/admin/FinancialsClient";
import { QuickBooksCard } from "@/components/admin/QuickBooksCard";

export const dynamic = "force-dynamic";

export type ShippedOrder = {
  id: string;
  /** Canonical revenue-recognition date: appointment_at →
   *  appointment_date → shipping_date → shipped_at → created_at,
   *  whichever is set first. Every completed order has at least
   *  created_at, so no revenue silently drops out anymore. */
  revenue_date: string;
  total_cad: number;
  test_cost_cad: number;
  test_count: number;
  manifest_id: string | null;
  /** Stripe processing fee (CAD) for this order, from Stripe's
   *  balance_transaction. Null when not yet backfilled. Counted as
   *  OpEx in the Financials view. */
  stripe_fee_cad: number | null;
};

/**
 * QBO transaction, trimmed to the fields the client needs. `direction`
 * is 'refund' for VendorCredit rows (subtract from period totals);
 * everything else is 'expense'.
 */
export type QboTxn = {
  txn_date: string;
  amount_cad: number;
  direction: "expense" | "refund";
  category: string | null;
  supplier_name: string | null;
};

export default async function AdminFinancialsPage() {
  const service = createServiceRoleClient();

  // 1. Orders — last 15 months so the 12-month chart has full context.
  // We used to require shipped_at IS NOT NULL, but many portal orders
  // reach status=Complete without shipped_at ever being set (same
  // silent-drop bug that hid Ana Filipovic from the Mayo matcher).
  // Now: pull every completed/shipped/resulted order in the window
  // and compute a canonical revenue_date via the same fallback chain
  // the matcher uses.
  const cutoffIso = new Date(
    Date.now() - 15 * 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      `
      id, appointment_at, appointment_date, shipping_date, shipped_at, created_at,
      total_cad, tax_cad, stripe_fee_cad, manifest_id,
      order_lines (
        quantity,
        test:tests ( cost_cad )
      )
    `,
    )
    .in("status", ["shipped", "resulted", "complete"])
    .gte("created_at", cutoffIso);

  type RawOrder = {
    id: string;
    appointment_at: string | null;
    appointment_date: string | null;
    shipping_date: string | null;
    shipped_at: string | null;
    created_at: string;
    total_cad: number | null;
    tax_cad: number | null;
    stripe_fee_cad: number | null;
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
      const revenue_date =
        o.appointment_at ||
        o.appointment_date ||
        o.shipping_date ||
        o.shipped_at ||
        o.created_at;
      // Pre-tax revenue: exclude GST. GST is money we collect on
      // behalf of CRA and remit — it is NOT income and mustn't
      // appear in the P&L. Was previously using total_cad which
      // inflated revenue by ~5%.
      const pretax = (o.total_cad ?? 0) - (o.tax_cad ?? 0);
      return {
        id: o.id,
        revenue_date,
        total_cad: pretax,
        test_cost_cad: testCost,
        test_count: testCount,
        manifest_id: o.manifest_id,
        stripe_fee_cad: o.stripe_fee_cad,
      };
    },
  );

  // Earliest revenue-generating order in the system. Used as the
  // cutoff for the chart / QBO query so we don't render months of
  // pre-portal QBO expenses (setup subscriptions, initial supplier
  // charges) with zero revenue attached — those made the chart look
  // like the business was losing $25k/mo in Jan-Apr when the
  // business hadn't opened its doors yet.
  const earliestRevenueDate = orders.reduce<string | null>((min, o) => {
    if (!min || o.revenue_date < min) return o.revenue_date;
    return min;
  }, null);
  const earliestOrderISO = earliestRevenueDate
    ? earliestRevenueDate.slice(0, 10)
    : null;

  // 3. QuickBooks transactions from first-order date forward.
  // Anything before that is pre-portal cost with no revenue to match,
  // which just spooks the chart with fake losses. Fall back to 15
  // months if no orders exist yet.
  const qboSinceDate =
    earliestOrderISO ??
    new Date(Date.now() - 15 * 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  let qboTxns: QboTxn[] = [];
  let cogsCategories: string[] = [];
  let uncategorizedSuppliers: Array<{
    supplier_name: string;
    count: number;
    total_amount: number;
  }> = [];
  try {
    const { data: txnsRaw } = await service
      .from("qbo_transactions")
      .select("txn_date, amount_cad, direction, category, supplier_name")
      .gte("txn_date", qboSinceDate)
      .order("txn_date", { ascending: true });
    qboTxns = (txnsRaw ?? []) as unknown as QboTxn[];

    const { data: catsRaw } = await service
      .from("expense_categories")
      .select("category, is_cogs");
    const cogsSet = new Set<string>();
    for (const c of (catsRaw ?? []) as Array<{
      category: string;
      is_cogs: boolean;
    }>) {
      if (c.is_cogs) cogsSet.add(c.category);
    }
    cogsCategories = [...cogsSet];

    // Roll up uncategorized suppliers for the mapper card
    const uncatMap = new Map<
      string,
      { count: number; total_amount: number }
    >();
    for (const t of qboTxns) {
      if (t.category != null) continue;
      const key = t.supplier_name ?? "(no supplier)";
      const prev = uncatMap.get(key) ?? { count: 0, total_amount: 0 };
      prev.count += 1;
      prev.total_amount +=
        t.direction === "refund" ? -t.amount_cad : t.amount_cad;
      uncatMap.set(key, prev);
    }
    uncategorizedSuppliers = [...uncatMap.entries()]
      .map(([supplier_name, v]) => ({ supplier_name, ...v }))
      .sort((a, b) => b.total_amount - a.total_amount);
  } catch {
    // migration 037 not applied yet — keep defaults, UI degrades gracefully
  }

  // 4. QBO integration status
  let qboConnected = false;
  let qboConnectedBy: string | null = null;
  let qboConnectedAt: string | null = null;
  let qboLastTxnSyncedAt: string | null = null;
  let qboTxnCount = 0;
  let qboUncategorizedCount = 0;
  try {
    const { data: integ } = await service
      .from("integrations")
      .select("connected_by, connected_at")
      .eq("provider", "quickbooks")
      .maybeSingle();
    if (integ) {
      qboConnected = true;
      const row = integ as {
        connected_by: string | null;
        connected_at: string;
      };
      qboConnectedBy = row.connected_by;
      qboConnectedAt = row.connected_at;
    }
    const { count: totalCount } = await service
      .from("qbo_transactions")
      .select("id", { count: "exact", head: true });
    qboTxnCount = totalCount ?? 0;
    qboUncategorizedCount = uncategorizedSuppliers.reduce(
      (s, u) => s + u.count,
      0,
    );
    const { data: lastSync } = await service
      .from("qbo_transactions")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    qboLastTxnSyncedAt =
      (lastSync as { synced_at: string } | null)?.synced_at ?? null;
  } catch {
    // migration not applied yet — keep defaults
  }

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
          Real revenue, COGS, and operating expenses — expenses come straight
          from QuickBooks.
        </p>
      </div>

      <QuickBooksCard
        connected={qboConnected}
        connectedBy={qboConnectedBy}
        connectedAt={qboConnectedAt}
        lastTxnSyncedAt={qboLastTxnSyncedAt}
        txnCount={qboTxnCount}
        uncategorizedCount={qboUncategorizedCount}
        uncategorizedSuppliers={uncategorizedSuppliers}
      />

      <FinancialsClient
        orders={orders}
        qboTxns={qboTxns}
        cogsCategories={cogsCategories}
        earliestOrderISO={earliestOrderISO}
      />
    </div>
  );
}
