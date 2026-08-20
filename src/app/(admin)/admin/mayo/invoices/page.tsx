import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MayoInvoiceUpload } from "@/components/admin/MayoInvoiceUpload";

export const dynamic = "force-dynamic";

/**
 * /admin/mayo/invoices
 *
 * List of ingested Mayo invoices with match progress per invoice.
 * Upload button POSTs to /api/admin/mayo/invoices with the JSON body
 * described in that route. PDF parsing is a v2 problem — for now,
 * extract to JSON with Claude or a one-off script.
 */

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_usd: number;
  fx_rate: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

interface LineAggRow {
  invoice_id: string;
  matched_count: number;
  unmatched_count: number;
  matched_amount: number;
  unmatched_amount: number;
}

export default async function MayoInvoicesListPage() {
  const service = createServiceRoleClient();

  const { data: invoicesRaw } = await service
    .from("mayo_invoices")
    .select(
      "id, invoice_number, invoice_date, total_usd, fx_rate, uploaded_at, uploaded_by",
    )
    .order("invoice_date", { ascending: false });
  const invoices = (invoicesRaw ?? []) as InvoiceRow[];

  // Per-invoice match progress. Doing this client-side of the DB with
  // one query then bucketing in JS — much simpler than a groupby view
  // and still fast at our scale.
  const { data: linesRaw } = await service
    .from("mayo_invoice_lines")
    .select("invoice_id, order_id, charge_usd");
  const lineAggs = new Map<string, LineAggRow>();
  for (const l of (linesRaw ?? []) as Array<{
    invoice_id: string;
    order_id: string | null;
    charge_usd: number;
  }>) {
    const agg = lineAggs.get(l.invoice_id) ?? {
      invoice_id: l.invoice_id,
      matched_count: 0,
      unmatched_count: 0,
      matched_amount: 0,
      unmatched_amount: 0,
    };
    if (l.order_id) {
      agg.matched_count += 1;
      agg.matched_amount += Number(l.charge_usd);
    } else {
      agg.unmatched_count += 1;
      agg.unmatched_amount += Number(l.charge_usd);
    }
    lineAggs.set(l.invoice_id, agg);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>Mayo Invoices</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Upload monthly Mayo Clinic Laboratories invoices, then match each
          line item to a portal order so real per-order COGS lands in Financials.
        </p>
      </div>

      <MayoInvoiceUpload />

      <div
        className="mt-6 rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#0f2614" }}>
              {[
                "Invoice Date",
                "Invoice #",
                "Total",
                "Matched",
                "Unmatched",
                "Uploaded",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                  style={{ color: "#c4973a" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-16 text-center"
                  style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
                >
                  No invoices uploaded yet.
                </td>
              </tr>
            ) : (
              invoices.map((inv, idx) => {
                const agg = lineAggs.get(inv.id);
                const matched = agg?.matched_count ?? 0;
                const unmatched = agg?.unmatched_count ?? 0;
                const total = matched + unmatched;
                const pctMatched = total > 0 ? (matched / total) * 100 : 0;
                return (
                  <tr
                    key={inv.id}
                    style={{
                      backgroundColor: idx % 2 === 0 ? "#0a1a0d" : "#1a3d22",
                      borderTop: "1px solid #1a3d22",
                    }}
                  >
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: "#ffffff" }}
                    >
                      {formatDate(inv.invoice_date)}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap font-mono text-xs"
                      style={{ color: "#e8d5a3" }}
                    >
                      {inv.invoice_number}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: "#c4973a" }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {formatCad(Number(inv.total_usd) * Number(inv.fx_rate))}
                      </div>
                      <div style={{ fontSize: 10, color: "#8dc63f" }}>
                        {formatUsd(Number(inv.total_usd))} @{" "}
                        {Number(inv.fx_rate).toFixed(4)}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: "#8dc63f" }}>
                      {matched} ·{" "}
                      {formatCad(
                        (agg?.matched_amount ?? 0) * Number(inv.fx_rate),
                      )}
                      <div
                        style={{
                          marginTop: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "#2d6b35",
                          overflow: "hidden",
                          width: 120,
                        }}
                      >
                        <div
                          style={{
                            width: `${pctMatched}%`,
                            height: "100%",
                            backgroundColor: "#8dc63f",
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: unmatched > 0 ? "#c4973a" : "#6ab04c" }}>
                      {unmatched} ·{" "}
                      {formatCad(
                        (agg?.unmatched_amount ?? 0) * Number(inv.fx_rate),
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: "#6ab04c" }}
                    >
                      {formatDateTime(inv.uploaded_at)}
                      {inv.uploaded_by && (
                        <div className="opacity-70">{inv.uploaded_by}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/mayo/invoices/${inv.id}`}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          backgroundColor: "#c4973a",
                          color: "#0a1a0d",
                          fontSize: 12,
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Open matcher
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCad(n: number): string {
  return n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  });
}
