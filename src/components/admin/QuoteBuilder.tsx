"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  X,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Send,
  Save,
  CheckCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeQuoteTotals, resolveManualDiscount } from "@/lib/quotes/totals";
import type { Quote } from "@/types/database";
import type {
  QuoteLineWithTest,
  CatalogueTestForQuote,
} from "@/app/(admin)/admin/quotes/[id]/page";

interface Props {
  initialQuote: Quote;
  initialLines: QuoteLineWithTest[];
  catalogue: CatalogueTestForQuote[];
}

const STATUS_COLOR = {
  draft: "#6ab04c",
  sent: "#93c5fd",
  accepted: "#8dc63f",
  expired: "#e05252",
} as const;

function isoDay(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formatDateLong(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function QuoteBuilder({ initialQuote, initialLines, catalogue }: Props) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote>(initialQuote);
  const [lines, setLines] = useState<QuoteLineWithTest[]>(initialLines);

  // Form fields (kept in local state, persisted via Save)
  // Fresh drafts may have null name/email fields — normalise to empty
  // strings so controlled inputs don't warn and the dirty-check stays sane.
  const [firstName, setFirstName] = useState(quote.client_first_name ?? "");
  const [lastName, setLastName] = useState(quote.client_last_name ?? "");
  const [email, setEmail] = useState(quote.client_email ?? "");
  const [personCount, setPersonCount] = useState(quote.person_count);
  const [collectionCity, setCollectionCity] = useState(
    quote.collection_city ?? ""
  );
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [expiresAt, setExpiresAt] = useState(isoDay(quote.expires_at));
  const [manualDiscountValue, setManualDiscountValue] = useState<string>(
    quote.manual_discount_value ? String(quote.manual_discount_value) : ""
  );
  const [manualDiscountType, setManualDiscountType] = useState<
    "amount" | "percent"
  >(quote.manual_discount_type ?? "amount");

  // Test search + person picker
  const [search, setSearch] = useState("");
  const [pendingPersonLabel, setPendingPersonLabel] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const manualDiscountNum = Number(manualDiscountValue) || 0;
  const dirty =
    firstName !== (quote.client_first_name ?? "") ||
    lastName !== (quote.client_last_name ?? "") ||
    email !== (quote.client_email ?? "") ||
    personCount !== quote.person_count ||
    collectionCity !== (quote.collection_city ?? "") ||
    notes !== (quote.notes ?? "") ||
    expiresAt !== isoDay(quote.expires_at) ||
    manualDiscountNum !== (quote.manual_discount_value ?? 0) ||
    manualDiscountType !== (quote.manual_discount_type ?? "amount");

  // Live totals from current lines + personCount + manual discount
  const liveTotals = useMemo(
    () =>
      computeQuoteTotals(lines, personCount, {
        value: manualDiscountNum,
        type: manualDiscountType,
      }),
    [lines, personCount, manualDiscountNum, manualDiscountType]
  );
  const liveManualDiscount = useMemo(
    () =>
      resolveManualDiscount(
        liveTotals.subtotal_cad,
        liveTotals.discount_cad,
        liveTotals.visit_fee_cad,
        { value: manualDiscountNum, type: manualDiscountType }
      ),
    [liveTotals, manualDiscountNum, manualDiscountType]
  );

  const filteredCatalogue = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalogue
      .filter((t) => {
        if (t.name.toLowerCase().includes(q)) return true;
        if (t.sku && t.sku.toLowerCase().includes(q)) return true;
        return false;
      })
      .slice(0, 8);
  }, [catalogue, search]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  // ─── Mutations ──────────────────────────────────────────────────────

  const addTest = async (test: CatalogueTestForQuote) => {
    setError(null);
    const res = await fetch(`/api/admin/quotes/${quote.id}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        test_id: test.id,
        person_label: pendingPersonLabel.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to add test");
      return;
    }
    // Optimistic add — and refresh from server for canonical totals
    const newLine: QuoteLineWithTest = {
      id: data.id,
      test_id: test.id,
      person_label: pendingPersonLabel.trim() || null,
      unit_price_cad: test.price_cad,
      test_name: test.name,
      lab_name: test.lab_name,
    };
    setLines((prev) => [...prev, newLine]);
    setSearch("");
    router.refresh();
  };

  const removeLine = async (lineId: string) => {
    setError(null);
    const res = await fetch(
      `/api/admin/quotes/${quote.id}/lines/${lineId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to remove test");
      return;
    }
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    router.refresh();
  };

  const saveDraft = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_first_name: firstName,
          client_last_name: lastName,
          client_email: email,
          person_count: personCount,
          collection_city: collectionCity || null,
          notes: notes || null,
          expires_at: expiresAt
            ? new Date(`${expiresAt}T00:00:00`).toISOString()
            : undefined,
          manual_discount_value: manualDiscountNum,
          manual_discount_type: manualDiscountType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      // Sync local quote snapshot
      setQuote((prev) => ({
        ...prev,
        client_first_name: firstName,
        client_last_name: lastName,
        client_email: email,
        person_count: personCount,
        collection_city: collectionCity || null,
        notes: notes || null,
        expires_at: expiresAt
          ? new Date(`${expiresAt}T00:00:00`).toISOString()
          : prev.expires_at,
        manual_discount_value: manualDiscountNum,
        manual_discount_type: manualDiscountType,
        ...liveTotals,
      }));
      flash("Draft saved");
    } finally {
      setSaving(false);
    }
  };

  const sendEmail = async () => {
    setError(null);
    if (dirty) {
      // Save edits first so the email reflects current state
      await saveDraft();
    }
    if (!firstName.trim()) {
      setError("Client first name is required to send the quote");
      return;
    }
    if (!email.trim()) {
      setError("Client email is required to send the quote");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one test before sending");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send quote");
        return;
      }
      setQuote((prev) => ({ ...prev, status: "sent", sent_at: data.sent_at }));
      flash(`Quote emailed to ${email}`);
      router.refresh();
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/admin/quotes"
            className="inline-flex items-center gap-1.5 text-sm mb-2"
            style={{ color: "#e8d5a3" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Quotes
          </Link>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>{quote.quote_number}</span>
          </h1>
          <p className="mt-1 text-xs" style={{ color: "#6ab04c" }}>
            Created {formatDateLong(quote.created_at)}
            {quote.sent_at && ` · Sent ${formatDateLong(quote.sent_at)}`}
          </p>
        </div>
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border capitalize"
          style={{
            backgroundColor: `${STATUS_COLOR[quote.status]}1f`,
            color: STATUS_COLOR[quote.status],
            borderColor: STATUS_COLOR[quote.status],
          }}
        >
          {quote.status}
        </span>
      </div>

      {(error || success) && (
        <div className="mb-4">
          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm border"
              style={{
                backgroundColor: "rgba(224, 82, 82, 0.12)",
                borderColor: "#e05252",
                color: "#e05252",
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm border"
              style={{
                backgroundColor: "rgba(141, 198, 63, 0.12)",
                borderColor: "#8dc63f",
                color: "#8dc63f",
              }}
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              {success}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — test search + line list */}
        <section
          className="rounded-xl border p-5 space-y-4"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <h2
            className="font-heading text-xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Tests
          </h2>

          {personCount > 1 && (
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "#e8d5a3" }}
              >
                Person label for next added test (optional)
              </label>
              <select
                value={pendingPersonLabel}
                onChange={(e) => setPendingPersonLabel(e.target.value)}
                className="mf-input cursor-pointer"
              >
                <option value="">Unassigned</option>
                {Array.from({ length: personCount }, (_, i) => `Person ${i + 1}`).map(
                  (label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </div>
          )}

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "#6ab04c" }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests by name or SKU…"
              className="mf-input pl-10"
            />
          </div>

          {filteredCatalogue.length > 0 && (
            <div
              className="rounded-lg border divide-y"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#2d6b35",
              }}
            >
              {filteredCatalogue.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addTest(t)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#1a3d22]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "#ffffff" }}>
                      {t.name}
                    </p>
                    <p className="text-xs" style={{ color: "#6ab04c" }}>
                      {t.sku ? `SKU: ${t.sku} · ` : ""}
                      {t.lab_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "#c4973a" }}
                    >
                      {formatCurrency(t.price_cad)}
                    </span>
                    <Plus className="w-4 h-4" style={{ color: "#c4973a" }} />
                  </div>
                </button>
              ))}
            </div>
          )}

          <div>
            <p
              className="text-xs uppercase tracking-wider mb-2"
              style={{ color: "#6ab04c" }}
            >
              Added Tests ({lines.length})
            </p>
            {lines.length === 0 ? (
              <p
                className="text-sm italic px-3 py-6 rounded-lg border text-center"
                style={{
                  color: "#6ab04c",
                  backgroundColor: "#0f2614",
                  borderColor: "#2d6b35",
                }}
              >
                Search above and click a test to add it
              </p>
            ) : (
              <ul className="space-y-1.5">
                {lines.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border"
                    style={{
                      backgroundColor: "#0f2614",
                      borderColor: "#2d6b35",
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm" style={{ color: "#ffffff" }}>
                        {l.test_name}
                      </p>
                      <p className="text-xs" style={{ color: "#6ab04c" }}>
                        {l.lab_name}
                        {l.person_label && (
                          <>
                            {" · "}
                            <span style={{ color: "#c4973a" }}>{l.person_label}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "#c4973a" }}
                      >
                        {formatCurrency(l.unit_price_cad)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        className="p-1 rounded transition-colors"
                        style={{ color: "#e05252" }}
                        aria-label="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* RIGHT — client info + summary */}
        <section className="space-y-6">
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <h2
              className="font-heading text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Client Info
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First name" required>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mf-input"
                />
              </Field>
              <Field label="Last name">
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mf-input"
                />
              </Field>
              <Field label="Email" required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mf-input"
                />
              </Field>
              <Field label="Person count">
                <select
                  value={personCount}
                  onChange={(e) => setPersonCount(Number(e.target.value))}
                  className="mf-input cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Collection city">
                <input
                  type="text"
                  value={collectionCity}
                  onChange={(e) => setCollectionCity(e.target.value)}
                  className="mf-input"
                  placeholder="Calgary"
                />
              </Field>
              <Field label="Quote expires">
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="mf-input"
                  style={{ colorScheme: "dark" }}
                />
              </Field>
            </div>
            <Field label="Notes (shown on email)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mf-input"
              />
            </Field>
          </div>

          {/* Summary */}
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
          >
            <h2
              className="font-heading text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Live Quote Summary
            </h2>
            <table className="w-full text-sm">
              <tbody>
                <SummaryRow
                  label="Subtotal"
                  value={formatCurrency(liveTotals.subtotal_cad)}
                />
                {liveTotals.discount_cad > 0 && (
                  <SummaryRow
                    label={`Multi-test discount (${lines.length} tests × $20)`}
                    value={`−${formatCurrency(liveTotals.discount_cad)}`}
                    accent="#c4973a"
                  />
                )}
                <SummaryRow
                  label={`Home visit fee (${personCount} ${personCount === 1 ? "person" : "people"})`}
                  value={formatCurrency(liveTotals.visit_fee_cad)}
                />
                {liveManualDiscount > 0 && (
                  <SummaryRow
                    label="Additional discount"
                    value={`−${formatCurrency(liveManualDiscount)}`}
                    accent="#c4973a"
                  />
                )}
                <tr>
                  <td
                    className="pt-3 border-t font-bold text-base"
                    style={{ color: "#ffffff", borderColor: "#2d6b35" }}
                  >
                    Total
                  </td>
                  <td
                    className="pt-3 border-t text-right font-bold text-base"
                    style={{ color: "#c4973a", borderColor: "#2d6b35" }}
                  >
                    {formatCurrency(liveTotals.total_cad)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Additional discount input */}
            <div
              className="rounded-lg border p-3 mt-2"
              style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
            >
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "#e8d5a3" }}
              >
                Additional Discount
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={manualDiscountValue}
                  onChange={(e) => setManualDiscountValue(e.target.value)}
                  placeholder="0"
                  className="mf-input flex-1"
                />
                <div
                  className="flex rounded-lg border overflow-hidden shrink-0"
                  style={{ borderColor: "#2d6b35" }}
                >
                  {(["amount", "percent"] as const).map((t) => {
                    const active = manualDiscountType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setManualDiscountType(t)}
                        className="px-3 text-sm font-semibold transition-colors"
                        style={{
                          backgroundColor: active ? "#c4973a" : "transparent",
                          color: active ? "#0a1a0d" : "#e8d5a3",
                        }}
                      >
                        {t === "amount" ? "$" : "%"}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-3">
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving || !dirty}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors"
                style={{
                  backgroundColor: "transparent",
                  borderColor: "#c4973a",
                  color: "#c4973a",
                  opacity: saving || !dirty ? 0.5 : 1,
                }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving…" : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={sendEmail}
                disabled={sending || lines.length === 0 || !email.trim() || !firstName.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: "#c4973a",
                  color: "#0a1a0d",
                  opacity:
                    sending || lines.length === 0 || !email.trim() || !firstName.trim()
                      ? 0.5
                      : 1,
                }}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sending
                  ? "Sending…"
                  : quote.status === "sent"
                    ? "Re-Send Quote Email"
                    : "Send Quote Email"}
              </button>
            </div>
            {dirty && (
              <p className="text-xs italic" style={{ color: "#c4973a" }}>
                Unsaved changes — saved automatically on send
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function SummaryRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <tr>
      <td className="py-1.5 text-sm" style={{ color: accent ?? "#e8d5a3" }}>
        {label}
      </td>
      <td
        className="py-1.5 text-right text-sm font-semibold"
        style={{ color: accent ?? "#ffffff" }}
      >
        {value}
      </td>
    </tr>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "#e8d5a3" }}
      >
        {label}
        {required && <span style={{ color: "#e05252" }}> *</span>}
      </label>
      {children}
    </div>
  );
}
