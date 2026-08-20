import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { qboQueryAll } from "./client";

/**
 * QuickBooks Online → qbo_transactions sync.
 *
 * What we pull:
 *   - Purchase          → cash/credit-card expenses (most of Mike's data)
 *   - Bill              → A/P bills to be paid later
 *   - VendorCredit      → refunds from vendors (negative direction)
 *
 * What we do NOT pull:
 *   - CreditCardPayment → money moving between accounts; NOT a P&L event.
 *     Ingesting it double-counts (~$38k/month in Mike's May–Aug window).
 *   - Deposit / Transfer → same reason.
 *
 * Sync is idempotent — the unique (qbo_id, qbo_txn_type) constraint on
 * qbo_transactions lets us upsert freely without duplicates.
 *
 * Categorization: each row's supplier_name is matched (ILIKE, first-hit)
 * against `expense_categories.supplier_pattern` to resolve `category`.
 * Unmatched suppliers get `category = null` and show up in an admin
 * "Uncategorized" bucket for Mike to map.
 */

// ─── QBO response shape (only the fields we actually use) ────────────────────
interface QboLineDetail {
  AccountRef?: { value: string; name: string };
}
interface QboLine {
  Amount?: number;
  DetailType?: string;
  AccountBasedExpenseLineDetail?: QboLineDetail;
  Description?: string;
}
interface QboPurchase {
  Id: string;
  TxnDate: string;
  TotalAmt?: number;
  PrivateNote?: string;
  EntityRef?: { value: string; name: string; type?: string };
  AccountRef?: { value: string; name: string }; // payment account (Amex / Scotia)
  PaymentType?: string;
  Credit?: boolean;                              // true = refund
  Line?: QboLine[];
}
interface QboBill {
  Id: string;
  TxnDate: string;
  TotalAmt?: number;
  PrivateNote?: string;
  VendorRef?: { value: string; name: string };
  Line?: QboLine[];
}
interface QboVendorCredit {
  Id: string;
  TxnDate: string;
  TotalAmt?: number;
  PrivateNote?: string;
  VendorRef?: { value: string; name: string };
  Line?: QboLine[];
}

// ─── Normalized shape we write ───────────────────────────────────────────────
interface TxnRow {
  qbo_id: string;
  qbo_txn_type: "Purchase" | "Bill" | "VendorCredit";
  txn_date: string;
  supplier_name: string | null;
  supplier_qbo_id: string | null;
  account_name: string | null;
  memo: string | null;
  amount_cad: number;
  direction: "expense" | "refund";
  category: string | null;
  posting: boolean;
  raw: unknown;
}

/**
 * Pull all transactions in [sinceDateISO, endOfToday] and upsert into
 * qbo_transactions. Returns counts by entity for the caller to log.
 */
export async function syncQboTransactions(
  service: SupabaseClient,
  sinceDateISO: string,
): Promise<{
  purchases: number;
  bills: number;
  vendorCredits: number;
  categorized: number;
  uncategorized: number;
}> {
  const categoryMap = await loadCategoryMap(service);

  const [purchases, bills, vendorCredits] = await Promise.all([
    qboQueryAll<QboPurchase>(
      service,
      "Purchase",
      `TxnDate >= '${sinceDateISO}'`,
    ),
    qboQueryAll<QboBill>(service, "Bill", `TxnDate >= '${sinceDateISO}'`),
    qboQueryAll<QboVendorCredit>(
      service,
      "VendorCredit",
      `TxnDate >= '${sinceDateISO}'`,
    ),
  ]);

  const rows: TxnRow[] = [];
  for (const p of purchases) rows.push(normalizePurchase(p, categoryMap));
  for (const b of bills) rows.push(normalizeBill(b, categoryMap));
  for (const v of vendorCredits) rows.push(normalizeVendorCredit(v, categoryMap));

  // Upsert in batches — Supabase upsert handles this fine but batching
  // keeps single failures from taking down the whole sync.
  const BATCH = 200;
  let categorized = 0;
  let uncategorized = 0;
  for (const r of rows) {
    if (r.category) categorized++;
    else uncategorized++;
  }
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await service
      .from("qbo_transactions")
      .upsert(slice, { onConflict: "qbo_id,qbo_txn_type" });
    if (error) {
      throw new Error(
        `qbo_transactions upsert failed (batch ${i / BATCH + 1}): ${error.message}`,
      );
    }
  }

  return {
    purchases: purchases.length,
    bills: bills.length,
    vendorCredits: vendorCredits.length,
    categorized,
    uncategorized,
  };
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizePurchase(
  p: QboPurchase,
  cats: Map<string, string>,
): TxnRow {
  const supplier = p.EntityRef?.name ?? null;
  return {
    qbo_id: p.Id,
    qbo_txn_type: "Purchase",
    txn_date: p.TxnDate,
    supplier_name: supplier,
    supplier_qbo_id: p.EntityRef?.value ?? null,
    account_name: p.AccountRef?.name ?? null,
    memo: p.PrivateNote ?? p.Line?.[0]?.Description ?? null,
    amount_cad: Math.abs(p.TotalAmt ?? 0),
    direction: p.Credit ? "refund" : "expense",
    category: supplier ? resolveCategory(supplier, cats) : null,
    posting: true,
    raw: p,
  };
}

function normalizeBill(b: QboBill, cats: Map<string, string>): TxnRow {
  const supplier = b.VendorRef?.name ?? null;
  return {
    qbo_id: b.Id,
    qbo_txn_type: "Bill",
    txn_date: b.TxnDate,
    supplier_name: supplier,
    supplier_qbo_id: b.VendorRef?.value ?? null,
    account_name: null,
    memo: b.PrivateNote ?? b.Line?.[0]?.Description ?? null,
    amount_cad: Math.abs(b.TotalAmt ?? 0),
    direction: "expense",
    category: supplier ? resolveCategory(supplier, cats) : null,
    posting: true,
    raw: b,
  };
}

function normalizeVendorCredit(
  v: QboVendorCredit,
  cats: Map<string, string>,
): TxnRow {
  const supplier = v.VendorRef?.name ?? null;
  return {
    qbo_id: v.Id,
    qbo_txn_type: "VendorCredit",
    txn_date: v.TxnDate,
    supplier_name: supplier,
    supplier_qbo_id: v.VendorRef?.value ?? null,
    account_name: null,
    memo: v.PrivateNote ?? v.Line?.[0]?.Description ?? null,
    amount_cad: Math.abs(v.TotalAmt ?? 0),
    direction: "refund",
    category: supplier ? resolveCategory(supplier, cats) : null,
    posting: true,
    raw: v,
  };
}

// ─── Category resolution ─────────────────────────────────────────────────────

/**
 * Build an in-memory lowercase-pattern → category map. The DB uses
 * ILIKE with % wildcards on read; we replicate that here with a
 * substring match so we don't round-trip per row.
 */
async function loadCategoryMap(
  service: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await service
    .from("expense_categories")
    .select("supplier_pattern, category");
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { supplier_pattern: string; category: string }[]) {
    map.set(row.supplier_pattern.toLowerCase(), row.category);
  }
  return map;
}

function resolveCategory(
  supplier: string,
  cats: Map<string, string>,
): string | null {
  const s = supplier.toLowerCase();
  for (const [pattern, cat] of cats) {
    if (s.includes(pattern)) return cat;
  }
  return null;
}
