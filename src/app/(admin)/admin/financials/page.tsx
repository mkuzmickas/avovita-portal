import { createServiceRoleClient } from "@/lib/supabase/server";
import { FinancialsClient } from "@/components/admin/FinancialsClient";
import { QuickBooksCard } from "@/components/admin/QuickBooksCard";

export const dynamic = "force-dynamic";

export type ShippedOrder = {
  id: string;
  /** Order status — drives the display badge AND the recognized-vs-
   *  projected split on the P&L. Only shipped/resulted/complete count
   *  toward Net Profit; confirmed/scheduled/collected show in the
   *  Revenue drill as "upcoming" projections so Mike can see what's
   *  on the books but not yet recognized. */
  status: string;
  /** Canonical revenue-recognition date — the APPOINTMENT date, not
   *  the order placement date. Chain: appointment_at → appointment_date
   *  → shipping_date → shipped_at → created_at. The service-date model
   *  (Mike, Oct 2026) lands revenue in the month the appointment
   *  happens, so a Nov 5 appointment booked on Oct 29 counts in
   *  November's P&L — matching where the Mayo cost will land. The
   *  non-appointment fallbacks exist only for legacy imports and
   *  edge-case orders without appointment data. */
  revenue_date: string;
  /** When the order was placed (orders.created_at, ISO). Shown
   *  alongside revenue_date so Mike can see the gap between booking
   *  and the appointment / collection date. */
  order_date: string;
  total_cad: number;
  test_cost_cad: number;
  test_count: number;
  /** Ordered SKUs for the test lines on this order — rendered as
   *  monospace chips in the Revenue drill, truncated with an expander
   *  when the list is long. */
  test_skus: string[];
  manifest_id: string | null;
  /** Stripe processing fee (CAD) for this order, from Stripe's
   *  balance_transaction. Null when not yet backfilled. Counted as
   *  OpEx in the Financials view. */
  stripe_fee_cad: number | null;
  /** Display label for the Revenue drill-down: primary profile name
   *  when we have it, waiver signature name second, account email
   *  last-resort. Never null so the drill-down row always renders. */
  client_label: string;
  /** Per-order Mayo cost (CAD). Preferred source: sum of matched
   *  mayo_invoice_lines charges × fx_rate ("invoice"). Fallback:
   *  catalog cost_cad × quantity ("catalog"). Flag tells the UI
   *  which to badge next to the number. */
  mayo_cost_cad: number;
  mayo_cost_source: "invoice" | "catalog";
  /** Per-order non-Mayo lab cost (CAD) — Armin, EpiSeek, ReligenDx,
   *  LabCorp, Dynacare. Catalog-only; no per-order invoice table. */
  non_mayo_cost_cad: number;
  /** FloLabs home-visit pass-through (CAD) — orders.home_visit_fee_cad
   *  per order. Zero for out-of-town drop-in collections. */
  flolabs_fee_cad: number;
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
  /** True for lumpy once-a-year costs (JMH accounting, Navacord
   *  insurance) — the dollars count as normal, but the drill-down
   *  tags the row with an "annual" badge so Mike reads the spike as
   *  a periodic professional fee rather than a run-rate cost. */
  is_annual_specialty?: boolean;
};

// Vendors whose spend is not part of go-forward business operations
// (Mike, Oct 2026). Excluded entirely from the normalized financials
// view — supplement inventory Jenna didn't resell, one-off equipment
// / furniture / personal / setup purchases, and sundry one-offs that
// don't recur. Keep this list tight; anything a reasonable future
// quarter might incur stays IN.
const BUSINESS_EXCLUDED_SUPPLIERS: RegExp[] = [
  // Supplements inventory
  /mitolife/i,
  /vitalitybits/i,
  /lifewave/i,
  /nivara/i,
  /\biherb\b/i,
  /\bledger\b/i,
  /biobody/i,
  // One-off setup / furniture / personal / sundry
  /1[\s-]?800\s*got\s*junk/i,
  /wayfair/i,
  /laptop\s*batteries/i,
  /macdonalds?/i,
  /mcdonalds?/i,
  /indigo/i,
  /mind\s*valley/i,
  /expressvpn/i,
  /abkb/i,
  /government\s+of\s+alberta/i,
  /sd\s*recon/i,
  /hrd2kll/i,
  /pdt\s+professional/i,
  /timpro/i,
  /form\s*dr/i,
  /\bexpo\b/i,
  /mothermind/i,
];

// Vendors Mike wants kept in the P&L but flagged visually as lumpy
// annual professional costs — accounting + insurance. The dollars land
// in the month they're paid (no amortisation), but each row renders
// with an "annual" badge in the OpEx drill so a monthly net-profit dip
// in the invoice month reads correctly.
const ANNUAL_SPECIALTY_SUPPLIERS: RegExp[] = [
  /jmh\s+accounting/i,
  /navacord/i,
];

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

  // Widen to include booked-but-not-yet-delivered statuses so the
  // Revenue drill can show them as "upcoming" rows (Oct 2026 — Mike).
  // Period math still only counts shipped/resulted/complete as
  // recognized revenue; the extra statuses render as projections.
  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      `
      id, status, appointment_at, appointment_date, shipping_date, shipped_at, created_at,
      total_cad, tax_cad, stripe_fee_cad, home_visit_fee_cad, manifest_id,
      account:accounts ( email, waiver_signed_name ),
      order_lines (
        quantity, line_type, unit_price_cad, custom_description,
        test:tests ( sku, cost_cad, lab:labs ( name ) ),
        profile:patient_profiles ( first_name, last_name, is_primary )
      )
    `,
    )
    .in("status", [
      "confirmed",
      "scheduled",
      "collected",
      "shipped",
      "resulted",
      "complete",
    ])
    .gte("created_at", cutoffIso);

  type RawOrder = {
    id: string;
    status: string;
    appointment_at: string | null;
    appointment_date: string | null;
    shipping_date: string | null;
    shipped_at: string | null;
    created_at: string;
    total_cad: number | null;
    tax_cad: number | null;
    stripe_fee_cad: number | null;
    home_visit_fee_cad: number | null;
    manifest_id: string | null;
    account: { email: string | null; waiver_signed_name: string | null } | null;
    order_lines: Array<{
      quantity: number;
      line_type: string | null;
      unit_price_cad: number | null;
      custom_description: string | null;
      test: {
        sku: string | null;
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

  // Per-order Mayo INVOICED actuals — pulled from mayo_invoice_lines
  // where a line was matched to an order via the invoice-matcher
  // workflow. Each matched line carries charge_usd and belongs to an
  // invoice with its own fx_rate (so CAD = charge_usd × fx_rate).
  // When an order has at least one matched line, we use the invoice
  // sum as its Mayo cost ("actual invoiced"); otherwise we fall back
  // to the catalog estimate ("estimate from catalogue").
  const { data: invoiceLinesRaw } = await service
    .from("mayo_invoice_lines")
    .select(
      "order_id, charge_usd, invoice:mayo_invoices!inner ( fx_rate )",
    )
    .not("order_id", "is", null);
  const mayoInvoicedByOrder = new Map<string, number>();
  for (const row of (invoiceLinesRaw ?? []) as Array<{
    order_id: string | null;
    charge_usd: number;
    invoice: { fx_rate: number } | { fx_rate: number }[] | null;
  }>) {
    if (!row.order_id) continue;
    const inv = Array.isArray(row.invoice) ? row.invoice[0] : row.invoice;
    const fx = Number(inv?.fx_rate ?? 1.43);
    const cad = Number(row.charge_usd) * fx;
    mayoInvoicedByOrder.set(
      row.order_id,
      (mayoInvoicedByOrder.get(row.order_id) ?? 0) + cad,
    );
  }

  // Per-order test cost tally broken out by lab so we can bucket
  // non-Mayo lab COGS (Armin, EpiSeek, ReligenDX, LabCorp, ...) into
  // their own monthly total downstream. Mayo catalog cost is also
  // bucketed per-month HERE as an accrual estimate — but only used
  // downstream for months that don't yet have a real mayo_invoices
  // row. The invoice total is still source of truth when available;
  // the accrual exists only to prevent the "0 COGS, 97% margin"
  // illusion while Mayo bills in arrears.
  const nonMayoLabCostByMonth = new Map<string, number>();
  const mayoCatalogCostByMonth = new Map<string, number>();
  // FloLabs collection fees are pass-through (we charge the client exactly
  // what we pay FloLabs). The orders.home_visit_fee_cad column is the
  // exact amount. Bucketed per revenue month, this becomes a service-date
  // FloLabs COGS accrual that replaces the payment-date QBO contractor
  // rows (which land weeks after the service and distort monthly P&L).
  const floLabsFeeByMonth = new Map<string, number>();

  const orders: ShippedOrder[] = ((ordersRaw ?? []) as unknown as RawOrder[]).map(
    (o) => {
      let testCost = 0;
      let testCount = 0;
      let nonMayoLabCost = 0;
      let mayoCatalogCost = 0;
      const testSkus: string[] = [];
      for (const line of o.order_lines ?? []) {
        const qty = line.quantity ?? 1;
        // Real test line — cost from the tests catalogue.
        if (line.line_type === "test" || !line.line_type) {
          const cost = line.test?.cost_cad ?? 0;
          testCost += cost * qty;
          testCount += qty;
          const sku = line.test?.sku;
          if (sku) {
            for (let i = 0; i < qty; i++) testSkus.push(sku);
          }
          const labName = line.test?.lab?.name ?? "";
          if (labName && /mayo/i.test(labName)) {
            mayoCatalogCost += cost * qty;
          } else if (labName) {
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
      const anchor = `${revenue_date.slice(0, 7)}-01`;
      if (nonMayoLabCost > 0) {
        nonMayoLabCostByMonth.set(
          anchor,
          (nonMayoLabCostByMonth.get(anchor) ?? 0) + nonMayoLabCost,
        );
      }
      if (mayoCatalogCost > 0) {
        mayoCatalogCostByMonth.set(
          anchor,
          (mayoCatalogCostByMonth.get(anchor) ?? 0) + mayoCatalogCost,
        );
      }
      // FloLabs home-visit pass-through — add this order's visit fee to
      // its revenue month. Zero for out-of-town drop-ins (no FloLabs
      // visit happened, so no cost).
      const visitFee = o.home_visit_fee_cad ?? 0;
      if (visitFee > 0) {
        floLabsFeeByMonth.set(
          anchor,
          (floLabsFeeByMonth.get(anchor) ?? 0) + visitFee,
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

      // Per-order Mayo cost — prefer invoice actuals when any matched
      // lines exist, else fall back to catalog estimate. The source
      // flag drives the badge on the per-order table row ("actual
      // invoiced" vs "estimate from catalogue").
      const invoicedMayo = mayoInvoicedByOrder.get(o.id) ?? 0;
      const mayoCost = invoicedMayo > 0 ? invoicedMayo : mayoCatalogCost;
      const mayoSource: "invoice" | "catalog" =
        invoicedMayo > 0 ? "invoice" : "catalog";

      return {
        id: o.id,
        status: o.status,
        revenue_date,
        order_date: o.created_at,
        total_cad: pretax,
        test_cost_cad: testCost,
        test_count: testCount,
        test_skus: testSkus,
        manifest_id: o.manifest_id,
        stripe_fee_cad: o.stripe_fee_cad,
        client_label,
        mayo_cost_cad: mayoCost,
        mayo_cost_source: mayoSource,
        non_mayo_cost_cad: nonMayoLabCost,
        flolabs_fee_cad: visitFee,
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
    // Suppress QBO payment-date rows for every supplier we accrue by
    // service date elsewhere. The problem these payments cause: FloLabs
    // and the labs invoice us weeks after the service, so leaving the
    // payment rows in COGS pins them to the wrong month and distorts
    // monthly P&L (September showed $4,628 of August FloLabs cost
    // because that was the Sep 7 payment date; September's Armin
    // payment on Sep 3 was for a July test).
    //
    // Replacements by supplier:
    //   - Mayo Clinic → mayo_invoice_lines fold by collection_date
    //   - FloLabs     → orders.home_visit_fee_cad by revenue_date
    //   - Non-Mayo labs (Armin, EpiSeek, ReligenDx, LabCorp, Dynacare)
    //                 → tests.cost_cad × qty by revenue_date (catalog)
    //
    // Suppliers not in this list keep their QBO txn_date (payment
    // date is close enough for SaaS, marketing, travel, bank fees).
    const SERVICE_DATE_SUPPLIERS = [
      /mayo\s*clinic/i,
      /\bflolabs?\b/i,
      /armin/i,
      /religendx/i,
      /religen\s*dx/i,
      /episeek/i,
      /labcorp/i,
      /dynacare/i,
    ];
    qboTxns = ((txnsRaw ?? []) as unknown as QboTxn[])
      .filter((t) => {
        const sup = t.supplier_name ?? "";
        if (SERVICE_DATE_SUPPLIERS.some((rx) => rx.test(sup))) return false;
        // Normalized-financials exclusions — supplements inventory,
        // one-off setup, personal, etc. See BUSINESS_EXCLUDED_SUPPLIERS
        // above for the full list and reasoning.
        if (BUSINESS_EXCLUDED_SUPPLIERS.some((rx) => rx.test(sup))) return false;
        return true;
      })
      .map((t) => {
        const sup = t.supplier_name ?? "";
        return ANNUAL_SPECIALTY_SUPPLIERS.some((rx) => rx.test(sup))
          ? { ...t, is_annual_specialty: true }
          : t;
      });

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
  // Map of YYYY-MM → actual Mayo cost (CAD) bucketed by COLLECTION
  // date, not invoice date. Every mayo invoice straddles two months
  // (end-of-month billing captures the prior month's lingering tests
  // plus the current month's early tests), so folding the whole
  // invoice at invoice_date mis-dated $3-4k of cost per month and
  // produced phantom losses. Using collection_date puts each line's
  // cost in the month the test was actually delivered — matching
  // when the revenue was recognized.
  const mayoActualCostByMonth = new Map<string, number>();
  try {
    // Mayo bills in USD. Migration 040 renamed total_cad → total_usd
    // and added a per-invoice fx_rate (default 1.43). CAD is computed
    // at display time as total_usd * fx_rate — the DB deliberately
    // doesn't store CAD so the spread lives on ONE canonical column.
    //
    // Fold at the LINE level: join lines to their invoice for fx_rate,
    // then bucket charge_usd × fx_rate by collection_date month.
    const { data: linesRaw, error: linesErr } = await service
      .from("mayo_invoice_lines")
      .select(
        "collection_date, charge_usd, invoice:mayo_invoices!inner ( id, invoice_number, invoice_date, fx_rate )",
      )
      .gte("collection_date", qboSinceDate);
    if (linesErr) throw linesErr;
    const invoiceLines = (linesRaw ?? []) as unknown as Array<{
      collection_date: string;
      charge_usd: number;
      invoice: {
        id: string;
        invoice_number: string;
        invoice_date: string;
        fx_rate: number;
      };
    }>;
    // Bucket per collection DAY, keyed by the actual YYYY-MM-DD.
    // Day-level matches the matcher's model: each invoice line is
    // tied to a specific collection date, which equals the portal
    // appointment date for matched orders. Cost lands on the same
    // day the revenue was recognized.
    const perDay = new Map<string, { cad: number; invoiceNumbers: Set<string> }>();
    for (const l of invoiceLines) {
      if (!l.collection_date || !l.invoice) continue;
      const dateKey = l.collection_date; // YYYY-MM-DD
      const cad = Number(l.charge_usd) * Number(l.invoice.fx_rate);
      const bucket = perDay.get(dateKey) ?? { cad: 0, invoiceNumbers: new Set() };
      bucket.cad += cad;
      bucket.invoiceNumbers.add(l.invoice.invoice_number);
      perDay.set(dateKey, bucket);
    }
    // Oct 2026 (Mike): per-order revenue table shows Mayo cost inline
    // for each order (invoice actuals when matched, catalog estimate
    // otherwise). The aggregated Mayo-invoice-fold COGS row would
    // double-count what's now shown inline, so we don't push rows
    // into qboTxns anymore — we just maintain mayoActualCostByMonth
    // for the accrual-gap diagnostic below.
    for (const [dateKey, bucket] of perDay.entries()) {
      const monthKey = dateKey.slice(0, 7);
      mayoActualCostByMonth.set(
        monthKey,
        (mayoActualCostByMonth.get(monthKey) ?? 0) + bucket.cad,
      );
    }
  } catch (err) {
    // Log so a silent schema/RLS drop is visible in Vercel logs
    // instead of just showing "0 Mayo COGS" and being called a bug.
    console.error("[financials] mayo_invoice_lines fold failed:", err);
  }

  // 3b.i. Mayo COGS ACCRUAL — for every month that has shipped Mayo
  //     orders, compare the catalog-cost estimate to the invoice-line
  //     actual (bucketed by collection_date above). If the actual is
  //     short of the estimate, synthesize the GAP as an accrual —
  //     meaning: tests collected in this month that haven't been
  //     invoiced yet. Fully-invoiced months get zero accrual
  //     automatically. Prevents the "0 COGS, 97% margin" illusion for
  //     the current month while keeping invoiced months on the
  //     actual.
  // Mayo accrual-gap, FloLabs, and non-Mayo-lab COGS rows no longer
  // pushed to qboTxns — they're all inlined per-order in the Revenue
  // drill-down table now (Oct 2026). The per-order view surfaces
  // actual vs. estimated at the row level with a badge, so this
  // aggregated-row display would double-count. Compute logic preserved
  // above (mayoActualCostByMonth, mayoCatalogCostByMonth,
  // nonMayoLabCostByMonth, floLabsFeeByMonth) in case we need these
  // for the P&L chart's accrual diagnostics; just not surfaced as
  // separate COGS rows.
  void nonMayoLabCostByMonth;
  void floLabsFeeByMonth;
  void mayoActualCostByMonth;
  void mayoCatalogCostByMonth;

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
        <p className="mt-1 text-xs" style={{ color: "#8dc63f" }}>
          Normalized view — supplement inventory, one-off equipment, personal,
          and sundry non-business QBO vendors are filtered out so the numbers
          reflect go-forward test operations. Annual professional fees (JMH
          accounting, Navacord insurance) still land in the month they were
          paid and are badged <span style={{ opacity: 0.9 }}>“annual”</span> in
          the OpEx drill.
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
