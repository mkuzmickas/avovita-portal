"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { grandTotalCad } from "@/lib/quotes/totals";
import type { Quote, QuoteStatus } from "@/types/database";

const STATUS_TABS: { key: QuoteStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "expired", label: "Expired" },
];

const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: "#6ab04c",
  sent: "#93c5fd",
  accepted: "#8dc63f",
  expired: "#e05252",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function QuotesListClient({ initialQuotes }: { initialQuotes: Quote[] }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [tab, setTab] = useState<QuoteStatus | "all">("all");

  const filtered = useMemo(
    () => (tab === "all" ? quotes : quotes.filter((q) => q.status === tab)),
    [quotes, tab]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotes.length };
    for (const q of quotes) c[q.status] = (c[q.status] ?? 0) + 1;
    return c;
  }, [quotes]);

  const removeQuote = async (id: string) => {
    if (!confirm("Delete this quote permanently?")) return;
    const res = await fetch(`/api/admin/quotes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed: ${data.error ?? res.statusText}`);
      return;
    }
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2 border-b" style={{ borderColor: "#2d6b35" }}>
          {STATUS_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="px-4 py-2.5 text-sm font-semibold transition-colors"
                style={{
                  color: active ? "#c4973a" : "#e8d5a3",
                  borderBottom: active ? "2px solid #c4973a" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                {t.label} ({counts[t.key] ?? 0})
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => router.push("/admin/quotes/new")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <Plus className="w-4 h-4" />
          New Quote
        </button>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {[
                  "Quote #",
                  "Client",
                  "Status",
                  "Total",
                  "Sent",
                  "Expires",
                  "Created",
                  "",
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
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-16 text-center"
                    style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
                  >
                    {quotes.length === 0
                      ? "No quotes yet — create your first one above."
                      : "No quotes match this filter."}
                  </td>
                </tr>
              ) : (
                filtered.map((q, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const color = STATUS_COLOR[q.status];
                  return (
                    <tr
                      key={q.id}
                      style={{
                        backgroundColor: rowBg,
                        borderTop: "1px solid #1a3d22",
                      }}
                    >
                      <td
                        className="px-4 py-3 font-mono text-xs whitespace-nowrap"
                        style={{ color: "#c4973a" }}
                      >
                        {q.quote_number}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#ffffff" }}>
                        <div>
                          {q.client_first_name || q.client_last_name
                            ? `${q.client_first_name} ${q.client_last_name}`.trim()
                            : <span style={{ color: "#6ab04c" }}>(unnamed)</span>}
                        </div>
                        {q.client_email && (
                          <div className="text-xs" style={{ color: "#6ab04c" }}>
                            {q.client_email}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize"
                          style={{
                            backgroundColor: `${color}1f`,
                            color,
                            borderColor: color,
                          }}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 font-semibold whitespace-nowrap"
                        style={{ color: "#c4973a" }}
                      >
                        {formatCurrency(grandTotalCad(q))}
                      </td>
                      <td
                        className="px-4 py-3 text-xs whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {formatDate(q.sent_at)}
                      </td>
                      <td
                        className="px-4 py-3 text-xs whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {formatDate(q.expires_at)}
                      </td>
                      <td
                        className="px-4 py-3 text-xs whitespace-nowrap"
                        style={{ color: "#6ab04c" }}
                      >
                        {formatDate(q.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/quotes/${q.id}`}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                            style={{
                              backgroundColor: "#c4973a",
                              color: "#0a1a0d",
                            }}
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeQuote(q.id)}
                            className="px-2 py-1 rounded-lg text-xs"
                            style={{
                              backgroundColor: "transparent",
                              color: "#e05252",
                            }}
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs flex items-center gap-1.5" style={{ color: "#6ab04c" }}>
        <Send className="w-3.5 h-3.5" />
        Drafts can be opened, edited and sent. Sent quotes can be edited and re-sent.
      </p>
    </div>
  );
}
