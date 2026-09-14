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
  /** Display label for the Revenue drill-down: primary profile name
   *  when we have it, waiver signature name second, account email
   *  last-resort. Never null so the drill-down row always renders. */
  client_label: string;
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
      account:accounts ( email, waiver_signed_name ),
      order_lines (
        quantity, line_type, unit_price_cad, custom_description,
        test:tests ( cost_cad, lab:labs ( name ) ),
        profile:patient_profiles ( first_name, last_name, is_primary )
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
    account: { email: string | null; waiver_signed_name: string | null } | null;
    order_lines: Array<{
      quantity: number;
      line_type: string | null;
      unit_price_cad: number | null;
      custom_description: string | null;
      test: {
        cost_cad: number | null;
        lab: { name: string | null } | null;
      } | null;
      profile: {
        first_name: string | null;
        last_name: string | null;
        is_primary: boolean | null;
      } | null;
    }>;
  };

  // Invoice line types the Stripe webhook mirrors as order_lines with
  // line_type='resource' are pass-through billings — most commonly the
  // FloLabs collection fee we bake into product invoices. They net to
  // zero profit (we charge exactly what we pay). Anything matching
  // this predicate contributes revenue = cost.
  const isPassthroughResource = (desc: string | null | undefined) =>
    typeof desc === "string" &&
    /\b(collect|flolab|shipping\s+fee|delivery\s+fee)\b/i.test(desc);

  // Per-order test cost tally broken out by lab so we can bucket
  // non-Mayo lab COGS (Armin, EpiSeek, ReligenDX, LabCorp, ...) into
  // their own monthly total downstream. Mayo test-catalog costs are
  // deliberately EXCLUDED — Mayo's actual invoice total is folded in
  // separately via the mayo_invoices synthesis so we don't double-
  // count what the real bill covers.
  const nonMayoLabCostByMonth = new Map<string, number>();

  const orders: ShippedOrder[] = ((ordersRaw ?? []) as unknown as RawOrder[]).map(
    (o) => {
      let testCost = 0;
      let testCount = 0;
      let nonMayoLabCost = 0;
      for (const line of o.order_lines ?? []) {
        const qty = line.quantity ?? 1;
        // Real test line — cost from the tests catalogue.
        if (line.line_type === "test" || !line.line_type) {
          const cost = line.test?.cost_cad ?? 0;
          testCost += cost * qty;
          testCount += qty;
          const labName = line.test?.lab?.name ?? "";
          if (labName && !/mayo/i.test(labName)) {
            nonMayoLabCost += cost * qty;
          }
          continue;
        }
        // Pass-through fee (collection, FloLabs, shipping) — treat the
        // charged price as our cost so it contributes zero margin.
        if (
          line.line_type === "resource" &&
          isPassthroughResource(line.custom_description)
        ) {
          testCost += (line.unit_price_cad ?? 0) * qty;
        }
        // Other resource/supplement/etc. lines: no test cost mapping,
        // no pass-through — they contribute their full revenue as
        // margin (correct for admin-time services etc.).
      }
      const revenue_date =
        o.appointment_at ||
        o.appointment_date ||
        o.shipping_date ||
        o.shipped_at ||
        o.created_at;

      // Bucket non-Mayo lab cost into a per-month total, keyed by the
      // YYYY-MM-01 anchor of the revenue_date so it lines up with the
      // month the corresponding revenue was recognized.
      if (nonMayoLabCost > 0) {
        const anchor = `${revenue_date.slice(0, 7)}-01`;
        nonMayoLabCostByMonth.set(
          anchor,
          (nonMayoLabCostByMonth.get(anchor) ?? 0) + nonMayoLabCost,
        );
      }
      // Pre-tax revenue: exclude GST. GST is money we collect on
      // behalf of CRA and remit — it is NOT income and mustn't
      // appear in the P&L. Was previously using total_cad which
      // inflated revenue by ~5%.
      const pretax = (o.total_cad ?? 0) - (o.tax_cad ?? 0);

      // Client label — primary profile first, any-profile second,
      // waiver_signed_name third, account email as the final
      // fallback. Ensures every drilldown row has a human-readable
      // client name even for invoice-mirrored orders where the
      // primary profile hasn't been linked to the test lines.
      const profiles = (o.order_lines ?? [])
        .map((l) => l.profile)
        .filter((p): p is NonNullable<typeof p> => p != null);
      const primaryProfile = profiles.find((p) => p.is_primary);
      const anyProfile = profiles[0];
      const nameFromProfile = primaryProfile ?? anyProfile;
      const client_label =
        (nameFromProfile
          ? `${nameFromProfile.first_name ?? ""} ${nameFromProfile.last_name ?? ""}`.trim()
          : "") ||
        (o.account?.waiver_signed_name ?? "").trim() ||
        (o.account?.email ?? "").trim() ||
        "(unknown client)";

      return {
        id: o.id,
        revenue_date,
        total_cad: pretax,
        test_cost_cad: testCost,
        test_count: testCount,
        manifest_id: o.manifest_id,
        stripe_fee_cad: o.stripe_fee_cad,
        client_label,
      };
    },
  );

  // Financials cutoff — hard floor at 2026-05-01 (portal launch)
  // regardless of what the earliest order says. April had a few
  // ramp-up orders that Mike explicitly wants excluded because the
  // portal wasn't really live yet. Use MAX(hard floor, earliest
  // order) so the cutoff also naturally advances if we ever have
  // no orders before some later date.
  const HARD_FLOOR_ISO = "2026-05-01";
  const earliestRevenueDate = orders.reduce<string | null>((min, o) => {
    if (!min || o.revenue_date < min) return o.revenue_date;
    return min;
  }, null);
  const derivedEarliest = earliestRevenueDate
    ? earliestRevenueDate.slice(0, 10)
    : null;
  const earliestOrderISO =
    derivedEarliest && derivedEarliest > HARD_FLOOR_ISO
      ? derivedEarliest
      : HARD_FLOOR_ISO;

  // Drop orders whose revenue_date is before the cutoff.
  const cutoffOrders = orders.filter(
    (o) => o.revenue_date.slice(0, 10) >= earliestOrderISO,
  );

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
  let categoryLags: Record<string, number> = {};
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
      .select("category, is_cogs, accrual_lag_days");
    const cogsSet = new Set<string>();
    const lags: Record<string, number> = {};
    for (const c of (catsRaw ?? []) as Array<{
      category: string;
      is_cogs: boolean;
      accrual_lag_days: number | null;
    }>) {
      if (c.is_cogs) cogsSet.add(c.category);
      // Multiple supplier_patterns map to the same category; take
      // the max lag across them (rows on the same category shouldn't
      // usually disagree, but max is safe).
      const lag = c.accrual_lag_days ?? 0;
      if (lag > (lags[c.category] ?? 0)) lags[c.category] = lag;
    }
    cogsCategories = [...cogsSet];
    categoryLags = lags;

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

  // 3b. Mayo Clinic Laboratories — synthesize a COGS bucket straight
  //     from the mayo_invoices table so the FULL invoice (matched +
  //     overhead + unmatched) lands in the month it was invoiced,
  //     regardless of which lines are still awaiting a portal-order
  //     match. Every dollar Mayo billed us is a real dollar out.
  //     Bypasses QBO because Mayo bills weren't being categorized in
  //     QBO at all (Aug had $0 Mayo COGS in QBO but $6,780 real
  //     matched invoice cost + $2,965 in yet-unmatched lines across
  //     May-Aug — the $18k August profit illusion).
  //
  //     Rendered as a first-class COGS category so the drill-down
  //     shows one row per invoice. Won't double-count QBO Mayo entries
  //     unless the user explicitly categorizes future QBO txns under
  //     the exact string used here — flagged separately for clarity.
  const MAYO_SYNTHETIC_CATEGORY = "mayo_invoices";
  try {
    // Mayo bills in USD. Migration 040 renamed total_cad → total_usd
    // and added a per-invoice fx_rate (default 1.43). CAD is computed
    // at display time as total_usd * fx_rate — the DB deliberately
    // doesn't store CAD so the spread lives on ONE canonical column.
    const { data: mayoInvoicesRaw, error: mayoErr } = await service
      .from("mayo_invoices")
      .select("invoice_number, invoice_date, total_usd, fx_rate")
      .gte("invoice_date", qboSinceDate)
      .order("invoice_date", { ascending: true });
    if (mayoErr) throw mayoErr;
    const mayoInvoices = (mayoInvoicesRaw ?? []) as Array<{
      invoice_number: string;
      invoice_date: string;
      total_usd: number;
      fx_rate: number;
    }>;
    for (const inv of mayoInvoices) {
      const cad = Number(inv.total_usd) * Number(inv.fx_rate);
      qboTxns.push({
        txn_date: inv.invoice_date,
        amount_cad: Number(cad.toFixed(2)),
        direction: "expense",
        category: MAYO_SYNTHETIC_CATEGORY,
        supplier_name: `Mayo invoice ${inv.invoice_number}`,
      });
    }
    if (mayoInvoices.length > 0 && !cogsCategories.includes(MAYO_SYNTHETIC_CATEGORY)) {
      cogsCategories.push(MAYO_SYNTHETIC_CATEGORY);
    }
  } catch (err) {
    // Log so a silent schema/RLS drop is visible in Vercel logs
    // instead of just showing "0 Mayo COGS" and being called a bug.
    console.error("[financials] mayo_invoices fold failed:", err);
  }

  // 3c. Non-Mayo lab COGS — synthesize a monthly bucket from the
  //     per-order test_cost_cad for every test line where the lab is
  //     NOT Mayo (Armin Labs, EpiSeek/Precision Epigenomics, ReligenDx,
  //     LabCorp, ...). These labs don't send us a consolidated monthly
  //     invoice like Mayo does, so we use the catalog cost per test as
  //     an accrual estimate. Bucketed by the order's revenue_date
  //     month so cost lines up with the revenue.
  const NON_MAYO_LAB_CATEGORY = "non_mayo_lab_costs";
  if (nonMayoLabCostByMonth.size > 0) {
    for (const [anchor, cost] of nonMayoLabCostByMonth.entries()) {
      qboTxns.push({
        txn_date: anchor,
        amount_cad: Number(cost.toFixed(2)),
        direction: "expense",
        category: NON_MAYO_LAB_CATEGORY,
        supplier_name: `Non-Mayo labs (${anchor.slice(0, 7)})`,
      });
    }
    if (!cogsCategories.includes(NON_MAYO_LAB_CATEGORY)) {
      cogsCategories.push(NON_MAYO_LAB_CATEGORY);
    }
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
        orders={cutoffOrders}
        qboTxns={qboTxns}
        cogsCategories={cogsCategories}
        categoryLags={categoryLags}
        earliestOrderISO={earliestOrderISO}
      />
    </div>
  );
}
