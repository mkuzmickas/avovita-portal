import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { ArrowLeft, ExternalLink, Download } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { InvoiceDetailActions } from "@/components/admin/InvoiceDetailActions";

export const dynamic = "force-dynamic";

const CURRENCY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#6ab04c" },
  sent: { label: "Sent — awaiting payment", color: "#d4a84a" },
  paid: { label: "Paid", color: "#8dc63f" },
  void: { label: "Void", color: "#e05252" },
};

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?returnUrl=/admin/invoices/${id}`);
  const { data: caller } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((caller as { role?: string } | null)?.role !== "admin") {
    redirect("/portal");
  }

  const service = createServiceRoleClient();
  const { data: invRaw } = await service
    .from("invoices")
    .select(
      `id, invoice_number, account_id, profile_id, order_id, invoice_type,
       stripe_invoice_id, stripe_payment_intent_id, stripe_hosted_invoice_url,
       status, subtotal_cad, tax_cad, total_cad, sent_at, paid_at,
       created_at, created_by, admin_notes,
       lines:invoice_line_items(
         id, line_type, test_id, supplement_id, description,
         quantity, unit_price_cad, line_total_cad, sort_order
       )`,
    )
    .eq("id", id)
    .maybeSingle();
  type Invoice = {
    id: string;
    invoice_number: string;
    account_id: string;
    profile_id: string | null;
    order_id: string | null;
    invoice_type: "products" | "order_amendment";
    stripe_invoice_id: string | null;
    stripe_payment_intent_id: string | null;
    stripe_hosted_invoice_url: string | null;
    status: "draft" | "sent" | "paid" | "void";
    subtotal_cad: number;
    tax_cad: number;
    total_cad: number;
    sent_at: string | null;
    paid_at: string | null;
    created_at: string;
    created_by: string;
    admin_notes: string | null;
    lines: Array<{
      id: string;
      line_type: string;
      test_id: string | null;
      supplement_id: string | null;
      description: string;
      quantity: number;
      unit_price_cad: number;
      line_total_cad: number;
      sort_order: number;
    }>;
  };
  const inv = invRaw as Invoice | null;
  if (!inv) notFound();

  // Client info.
  const { data: acct } = await service
    .from("accounts")
    .select("email, phone")
    .eq("id", inv.account_id)
    .maybeSingle();
  const { data: profile } = await service
    .from("patient_profiles")
    .select("first_name, last_name, phone, date_of_birth")
    .eq("account_id", inv.account_id)
    .eq("is_primary", true)
    .maybeSingle();
  const { data: creator } = await service
    .from("accounts")
    .select("email")
    .eq("id", inv.created_by)
    .maybeSingle();

  const account = acct as { email: string | null; phone: string | null } | null;
  const prof = profile as {
    first_name: string;
    last_name: string;
    phone: string | null;
    date_of_birth: string | null;
  } | null;
  const creatorRow = creator as { email: string | null } | null;
  const status = STATUS_LABEL[inv.status];

  const sortedLines = [...inv.lines].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <Link
        href="/admin/invoices"
        className="inline-flex items-center gap-1.5 text-sm mb-3"
        style={{ color: "#e8d5a3" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Invoices
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>{inv.invoice_number}</span>
          </h1>
          <div
            className="mt-1 flex flex-wrap items-center gap-3 text-sm"
            style={{ color: "#e8d5a3" }}
          >
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
              style={{
                backgroundColor: `${status.color}1f`,
                borderColor: status.color,
                color: status.color,
              }}
            >
              {status.label}
            </span>
            <span>
              {inv.invoice_type === "order_amendment"
                ? "Order amendment"
                : "Products invoice"}
            </span>
            {inv.invoice_type === "order_amendment" && inv.order_id && (
              <Link
                href={`/admin/orders`}
                className="underline"
                style={{ color: "#6ab04c" }}
              >
                Order #{inv.order_id.slice(0, 8).toUpperCase()}
              </Link>
            )}
          </div>
        </div>
        <InvoiceDetailActions
          invoiceId={inv.id}
          invoiceNumber={inv.invoice_number}
          status={inv.status}
          hostedInvoiceUrl={inv.stripe_hosted_invoice_url}
        />
      </div>

      {/* Client + audit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <section
          className="rounded-xl border p-5"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <h2
            className="text-xs uppercase tracking-wider mb-2 font-bold"
            style={{ color: "#c4973a" }}
          >
            Client
          </h2>
          <p className="text-sm" style={{ color: "#ffffff" }}>
            {prof
              ? `${prof.first_name} ${prof.last_name}`
              : (account?.email ?? "—")}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#e8d5a3" }}>
            {account?.email ?? "—"}
          </p>
          <p className="text-xs" style={{ color: "#e8d5a3" }}>
            {prof?.phone ?? account?.phone ?? "—"}
          </p>
          {prof?.date_of_birth && (
            <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
              DOB {formatDate(prof.date_of_birth)}
            </p>
          )}
        </section>
        <section
          className="rounded-xl border p-5"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <h2
            className="text-xs uppercase tracking-wider mb-2 font-bold"
            style={{ color: "#c4973a" }}
          >
            Audit
          </h2>
          <dl
            className="text-xs space-y-1"
            style={{ color: "#e8d5a3" }}
          >
            <div className="flex justify-between gap-3">
              <dt>Created</dt>
              <dd>{formatDate(inv.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Sent</dt>
              <dd>{inv.sent_at ? formatDate(inv.sent_at) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Paid</dt>
              <dd>{inv.paid_at ? formatDate(inv.paid_at) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Created by</dt>
              <dd>{creatorRow?.email ?? "—"}</dd>
            </div>
            {inv.stripe_invoice_id && (
              <div className="flex justify-between gap-3 break-all">
                <dt>Stripe Invoice ID</dt>
                <dd className="font-mono">{inv.stripe_invoice_id}</dd>
              </div>
            )}
            {inv.stripe_hosted_invoice_url && (
              <div className="pt-2">
                <a
                  href={inv.stripe_hosted_invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                  style={{ color: "#c4973a" }}
                >
                  Open Stripe Hosted Invoice
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </dl>
        </section>
      </div>

      {/* Lines */}
      <section
        className="rounded-xl border overflow-hidden mb-6"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {["Description", "Type", "Qty", "Unit", "Line Total"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                      style={{
                        color: "#c4973a",
                        fontFamily: '"DM Sans", sans-serif',
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {sortedLines.map((l, idx) => {
                const bg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                return (
                  <tr key={l.id} style={{ backgroundColor: bg }}>
                    <td className="px-4 py-3" style={{ color: "#ffffff" }}>
                      {l.description}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: "#6ab04c" }}
                    >
                      {l.line_type}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: "#e8d5a3" }}
                    >
                      {l.quantity}
                    </td>
                    <td
                      className="px-4 py-3 text-xs whitespace-nowrap"
                      style={{ color: "#e8d5a3" }}
                    >
                      {CURRENCY.format(l.unit_price_cad)}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap font-semibold"
                      style={{ color: "#c4973a" }}
                    >
                      {CURRENCY.format(l.line_total_cad)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#0f2614" }}>
                <td colSpan={3} className="px-4 py-2"></td>
                <td
                  className="px-4 py-2 text-xs uppercase"
                  style={{ color: "#6ab04c" }}
                >
                  Subtotal
                </td>
                <td
                  className="px-4 py-2 whitespace-nowrap"
                  style={{ color: "#e8d5a3" }}
                >
                  {CURRENCY.format(inv.subtotal_cad)}
                </td>
              </tr>
              <tr style={{ backgroundColor: "#0f2614" }}>
                <td colSpan={3} className="px-4 py-2"></td>
                <td
                  className="px-4 py-2 text-xs uppercase"
                  style={{ color: "#6ab04c" }}
                >
                  GST 5%
                </td>
                <td
                  className="px-4 py-2 whitespace-nowrap"
                  style={{ color: "#e8d5a3" }}
                >
                  {CURRENCY.format(inv.tax_cad)}
                </td>
              </tr>
              <tr style={{ backgroundColor: "#0f2614" }}>
                <td colSpan={3} className="px-4 py-2"></td>
                <td
                  className="px-4 py-2 text-xs font-bold uppercase"
                  style={{ color: "#c4973a" }}
                >
                  Total
                </td>
                <td
                  className="px-4 py-2 whitespace-nowrap font-bold"
                  style={{ color: "#c4973a" }}
                >
                  {CURRENCY.format(inv.total_cad)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {inv.admin_notes && (
        <section
          className="rounded-xl border p-5"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <h2
            className="text-xs uppercase tracking-wider mb-2 font-bold"
            style={{ color: "#c4973a" }}
          >
            Admin notes (internal)
          </h2>
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: "#e8d5a3" }}
          >
            {inv.admin_notes}
          </p>
        </section>
      )}

      {/* Hint about PDF endpoint — Phase 3 wires the actual route */}
      <p
        className="mt-4 text-xs flex items-center gap-1.5"
        style={{ color: "#6ab04c" }}
      >
        <Download className="w-3 h-3" />
        Invoice PDF download arrives in Phase 3.
      </p>
    </div>
  );
}
