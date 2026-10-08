import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { candidatesForLine } from "@/lib/mayo/match-candidates";
import { MayoInvoiceMatcher } from "@/components/admin/MayoInvoiceMatcher";
import { MayoFxReconcilePanel } from "@/components/admin/MayoFxReconcilePanel";
import type { OrderCandidate } from "@/lib/mayo/match-candidates";

export const dynamic = "force-dynamic";

/**
 * /admin/mayo/invoices/[id]
 *
 * Server-renders the full invoice, groups lines by patient (so drag
 * targets are natural), and pre-computes candidate portal orders for
 * every unmatched line. Passes everything to the client matcher which
 * handles the drag-and-drop UX.
 */

export interface MatchLine {
  id: string;
  collection_date: string;
  accession_no: string;
  specimen_no: string | null;
  mayo_patient_id: string | null;
  patient_name: string;
  test_id: string;
  description: string | null;
  charge_usd: number;
  order_id: string | null;
  matched_by: string | null;
  no_portal_order: boolean;
  candidates: OrderCandidate[];
  /** For already-matched lines, the linked order's summary so we can
   *  show what it's pointing at without another round-trip. */
  matched_order: MatchedOrderSummary | null;
}

export interface PatientGroup {
  patient_name: string;
  mayo_patient_id: string | null;
  lines: MatchLine[];
  total_charge_usd: number;
}

export interface MatchedOrderSummary {
  id: string;
  patient_name: string;
  patient_dob: string | null;
  appointment_at: string | null;
  shipping_date: string | null;
}

interface LineRow {
  id: string;
  collection_date: string;
  accession_no: string;
  specimen_no: string | null;
  mayo_patient_id: string | null;
  patient_name: string;
  test_id: string;
  description: string | null;
  charge_usd: number;
  order_id: string | null;
  matched_by: string | null;
  no_portal_order: boolean;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_usd: number;
  fx_rate: number;
}

export default async function MayoInvoiceMatcherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceRoleClient();

  const { data: inv } = await service
    .from("mayo_invoices")
    .select("id, invoice_number, invoice_date, total_usd, fx_rate")
    .eq("id", id)
    .maybeSingle();
  if (!inv) notFound();
  const invoice = inv as unknown as InvoiceRow;

  const { data: linesRaw } = await service
    .from("mayo_invoice_lines")
    .select(
      "id, collection_date, accession_no, specimen_no, mayo_patient_id, patient_name, test_id, description, charge_usd, order_id, matched_by, no_portal_order",
    )
    .eq("invoice_id", id)
    .order("collection_date", { ascending: true });
  const lineRows = (linesRaw ?? []) as LineRow[];

  // Compute candidates for unmatched lines in parallel. For matched
  // lines, load the linked order's patient info.
  const matchedOrderIds = [
    ...new Set(lineRows.filter((l) => l.order_id).map((l) => l.order_id!)),
  ];

  interface MatchedOrderJoinRow {
    id: string;
    appointment_at: string | null;
    shipping_date: string | null;
    patient_profiles: {
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
    } | null;
  }
  const { data: matchedOrdersRaw } = matchedOrderIds.length
    ? await service
        .from("orders")
        .select(
          "id, appointment_at, shipping_date, patient_profiles ( first_name, last_name, date_of_birth )",
        )
        .in("id", matchedOrderIds)
    : { data: [] };
  const matchedOrderMap = new Map<string, MatchedOrderSummary>();
  for (const o of (matchedOrdersRaw ?? []) as unknown as MatchedOrderJoinRow[]) {
    const p = o.patient_profiles;
    matchedOrderMap.set(o.id, {
      id: o.id,
      patient_name: p ? `${p.first_name} ${p.last_name}` : "(unknown)",
      patient_dob: p?.date_of_birth ?? null,
      appointment_at: o.appointment_at,
      shipping_date: o.shipping_date,
    });
  }

  // Reconciliation data — find the next-later invoice to bound the
  // AMEX payment window, then sum the Mayo QBO rows that fall between
  // this invoice's date (exclusive) and the next invoice (inclusive).
  // Mayo bills monthly on NET 30, so all payments between invoice N
  // and invoice N+1 clear invoice N. For the latest invoice, no upper
  // bound — the window extends to "now".
  const { data: allInvDatesRaw } = await service
    .from("mayo_invoices")
    .select("invoice_date")
    .order("invoice_date", { ascending: true });
  const allInvDates = ((allInvDatesRaw ?? []) as Array<{
    invoice_date: string;
  }>).map((r) => r.invoice_date);
  const myIdx = allInvDates.indexOf(invoice.invoice_date);
  const nextInvoiceDate =
    myIdx >= 0 && myIdx + 1 < allInvDates.length
      ? allInvDates[myIdx + 1]
      : null;

  let amexPaymentsRaw = service
    .from("qbo_transactions")
    .select("txn_date, amount_cad")
    .ilike("supplier_name", "%mayo%clinic%")
    .gt("txn_date", invoice.invoice_date);
  if (nextInvoiceDate) {
    amexPaymentsRaw = amexPaymentsRaw.lte("txn_date", nextInvoiceDate);
  }
  const { data: payRaw } = await amexPaymentsRaw.order("txn_date", {
    ascending: true,
  });
  const amexPayments = ((payRaw ?? []) as Array<{
    txn_date: string;
    amount_cad: number;
  }>).map((p) => ({
    txn_date: p.txn_date,
    amount_cad: Number(p.amount_cad),
  }));

  const linesWithCandidates: MatchLine[] = await Promise.all(
    lineRows.map(async (l) => ({
      ...l,
      candidates:
        l.order_id || l.no_portal_order
          ? []
          : await candidatesForLine(service, {
              patient_name: l.patient_name,
              collection_date: l.collection_date,
            }),
      matched_order: l.order_id ? matchedOrderMap.get(l.order_id) ?? null : null,
    })),
  );

  // Group by patient_name
  const groups = new Map<string, PatientGroup>();
  for (const l of linesWithCandidates) {
    const key = l.patient_name;
    const g = groups.get(key) ?? {
      patient_name: l.patient_name,
      mayo_patient_id: l.mayo_patient_id,
      lines: [],
      total_charge_usd: 0,
    };
    g.lines.push(l);
    g.total_charge_usd += Number(l.charge_usd);
    groups.set(key, g);
  }
  const patientGroups = [...groups.values()].sort((a, b) =>
    a.patient_name.localeCompare(b.patient_name),
  );

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/mayo/invoices"
          style={{ color: "#c4973a", fontSize: 12, fontWeight: 600 }}
        >
          ← Invoices
        </Link>
        <h1
          className="font-heading text-3xl font-semibold mt-2"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Invoice{" "}
          <span style={{ color: "#c4973a" }}>{invoice.invoice_number}</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Dated {formatDate(invoice.invoice_date)} · Total{" "}
          {formatUsd(Number(invoice.total_usd))} USD →{" "}
          <span style={{ color: "#c4973a", fontWeight: 700 }}>
            {formatCad(Number(invoice.total_usd) * Number(invoice.fx_rate))}
          </span>{" "}
          @ {Number(invoice.fx_rate).toFixed(4)} · {lineRows.length} line
          {lineRows.length === 1 ? "" : "s"}
        </p>
      </div>

      <MayoFxReconcilePanel
        invoiceId={invoice.id}
        invoiceDate={invoice.invoice_date}
        totalUsd={Number(invoice.total_usd)}
        currentFxRate={Number(invoice.fx_rate)}
        estimatedCad={Number(invoice.total_usd) * Number(invoice.fx_rate)}
        payments={amexPayments}
        nextInvoiceDate={nextInvoiceDate}
      />

      <MayoInvoiceMatcher
        invoiceId={invoice.id}
        fxRate={Number(invoice.fx_rate)}
        patientGroups={patientGroups}
      />
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
