import Link from "next/link";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  account_id: string;
  order_id: string | null;
  invoice_type: "products" | "order_amendment";
  status: "draft" | "sent" | "paid" | "void";
  total_cad: number;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  created_by: string;
  account: { email: string | null } | { email: string | null }[] | null;
};

const STATUS_STYLE: Record<
  InvoiceRow["status"],
  { bg: string; border: string; color: string; label: string }
> = {
  draft: {
    bg: "rgba(106,176,76,0.10)",
    border: "#6ab04c",
    color: "#6ab04c",
    label: "Draft",
  },
  sent: {
    bg: "rgba(217,169,57,0.12)",
    border: "#d4a84a",
    color: "#d4a84a",
    label: "Sent",
  },
  paid: {
    bg: "rgba(141,198,63,0.12)",
    border: "#8dc63f",
    color: "#8dc63f",
    label: "Paid",
  },
  void: {
    bg: "rgba(224,82,82,0.12)",
    border: "#e05252",
    color: "#e05252",
    label: "Void",
  },
};

const CURRENCY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

export default async function AdminInvoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?returnUrl=/admin/invoices");
  const { data: caller } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((caller as { role?: string } | null)?.role !== "admin") {
    redirect("/portal");
  }

  const service = createServiceRoleClient();
  // invoices joins accounts via TWO foreign keys (account_id and
  // created_by) so the embed must name the FK explicitly — PostgREST
  // 201s the request otherwise. The previous unqualified shorthand
  // failed silently and the page rendered "No invoices yet" with
  // real rows in the DB.
  const { data: invoicesRaw, error: invoicesErr } = await service
    .from("invoices")
    .select(
      `id, invoice_number, account_id, order_id, invoice_type, status,
       total_cad, sent_at, paid_at, created_at, created_by,
       account:accounts!invoices_account_id_fkey(email)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (invoicesErr) {
    // Surface this so a future FK ambiguity doesn't silently empty
    // the list again. Vercel logs catch it; the empty state stays.
    console.error("[admin:invoices:list] query failed:", invoicesErr);
  }
  const invoices = ((invoicesRaw ?? []) as unknown as InvoiceRow[]) || [];

  // Resolve creator emails in one round-trip.
  const creatorIds = [...new Set(invoices.map((i) => i.created_by))];
  let creatorEmailById = new Map<string, string | null>();
  if (creatorIds.length > 0) {
    const { data: creators } = await service
      .from("accounts")
      .select("id, email")
      .in("id", creatorIds);
    creatorEmailById = new Map(
      ((creators ?? []) as Array<{ id: string; email: string | null }>).map(
        (c) => [c.id, c.email],
      ),
    );
  }

  // Resolve primary patient profile names by account.
  const accountIds = [...new Set(invoices.map((i) => i.account_id))];
  const profileNameById = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data: profiles } = await service
      .from("patient_profiles")
      .select("account_id, first_name, last_name")
      .in("account_id", accountIds)
      .eq("is_primary", true);
    for (const p of (profiles ?? []) as Array<{
      account_id: string;
      first_name: string;
      last_name: string;
    }>) {
      profileNameById.set(p.account_id, `${p.first_name} ${p.last_name}`);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>Invoices</span>
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#e8d5a3" }}>
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"} ·
            most recent first
          </p>
        </div>
        <Link
          href="/admin/invoices/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </Link>
      </div>

      {invoices.length === 0 ? (
        <div
          className="rounded-xl border px-6 py-16 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <FileText
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "#2d6b35" }}
          />
          <p style={{ color: "#e8d5a3" }}>No invoices yet.</p>
          <p className="text-sm mt-2" style={{ color: "#6ab04c" }}>
            Click <strong>New Invoice</strong> to send a standalone
            invoice for supplements, Oligoscan, or other walk-in
            purchases.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#0f2614" }}>
                  {[
                    "Invoice",
                    "Type",
                    "Client",
                    "Total",
                    "Status",
                    "Sent",
                    "Paid",
                    "Created by",
                  ].map((h) => (
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
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => {
                  const bg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const acct = Array.isArray(inv.account)
                    ? inv.account[0]
                    : inv.account;
                  const status = STATUS_STYLE[inv.status];
                  const clientName =
                    profileNameById.get(inv.account_id) ??
                    acct?.email ??
                    "—";
                  return (
                    <tr
                      key={inv.id}
                      className="hover:opacity-90 cursor-pointer"
                      style={{ backgroundColor: bg }}
                    >
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        <Link
                          href={`/admin/invoices/${inv.id}`}
                          style={{ color: "#c4973a" }}
                        >
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3" style={{ color: "#e8d5a3" }}>
                        {inv.invoice_type === "order_amendment" ? (
                          <span className="text-xs">
                            Order amendment
                            {inv.order_id && (
                              <Link
                                href={`/admin/orders`}
                                className="ml-2 underline"
                                style={{ color: "#6ab04c" }}
                              >
                                #{inv.order_id.slice(0, 8).toUpperCase()}
                              </Link>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs">Products</span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#ffffff" }}>
                        <div>{clientName}</div>
                        <div
                          className="text-xs"
                          style={{ color: "#6ab04c" }}
                        >
                          {acct?.email ?? "—"}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap font-semibold"
                        style={{ color: "#c4973a" }}
                      >
                        {CURRENCY.format(inv.total_cad)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                          style={{
                            backgroundColor: status.bg,
                            borderColor: status.border,
                            color: status.color,
                          }}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-xs whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {inv.sent_at ? formatDate(inv.sent_at) : "—"}
                      </td>
                      <td
                        className="px-4 py-3 text-xs whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {inv.paid_at ? formatDate(inv.paid_at) : "—"}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "#6ab04c" }}
                      >
                        {creatorEmailById.get(inv.created_by) ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
