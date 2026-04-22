"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  X,
  Plus,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  Send,
  Save,
  CheckCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  computeQuoteTotals,
  grandTotalCad,
  resolveManualDiscount,
} from "@/lib/quotes/totals";
import {
  MISSING_DATA_COLOR,
  formatShipTempLong,
  formatStability,
  stabilityColorForTest,
  summarizeShipTemp,
  summarizeStability,
  testsWithMissingData,
  type StabilityItem,
} from "@/lib/quotes/stability";
import type { ShipTemp } from "@/lib/tests/shipTempDisplay";
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
  const [isListOpen, setIsListOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [pendingPersonLabel, setPendingPersonLabel] = useState<string>("");

  // Click-outside — close the dropdown when the user clicks elsewhere.
  // Clicks on the input and on the result rows are inside the ref'd
  // container, so they don't trigger a close.
  useEffect(() => {
    if (!isListOpen) return;
    function onDocClick(e: MouseEvent) {
      const el = searchContainerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setIsListOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isListOpen]);

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
  // Admin-only margin: total minus the sum of wholesale cost_cad for
  // the tests in this quote. Lines whose test has no cost are skipped
  // and surfaced via a footnote. Never sent to the client — this sits
  // only in the in-app Live Quote Summary.
  const costByTestId = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const c of catalogue) m.set(c.id, c.cost_cad);
    return m;
  }, [catalogue]);

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

  const margin = useMemo(() => {
    let totalCost = 0;
    let missing = 0;
    for (const l of lines) {
      const c = costByTestId.get(l.test_id);
      if (typeof c === "number") totalCost += c;
      else missing += 1;
    }
    // Margin = test revenue − test cost − discounts. The home-visit
    // fee is excluded because it's pass-through to FloLabs; discounts
    // reduce the number so applying a bigger discount lowers margin.
    const testRevenue = liveTotals.subtotal_cad;
    const discounts = liveTotals.discount_cad + liveManualDiscount;
    const amount = testRevenue - totalCost - discounts;
    const netRevenue = Math.max(0, testRevenue - discounts);
    const pct =
      netRevenue > 0 ? Math.round((amount / netRevenue) * 100) : 0;
    return { amount, pct, missing, hasAnyCost: lines.length > missing };
  }, [
    lines,
    costByTestId,
    liveTotals.subtotal_cad,
    liveTotals.discount_cad,
    liveManualDiscount,
  ]);

  // Test ids currently in the quote — powers the "Added" indicator and
  // toggle-add behavior on the search dropdown.
  const addedTestIds = useMemo(
    () => new Set(lines.map((l) => l.test_id)),
    [lines]
  );

  const stabilityItems = useMemo<StabilityItem[]>(
    () =>
      lines.map((l) => ({
        test_id: l.test_id,
        test_name: l.test_name,
        ship_temp: l.ship_temp,
        stability_days: l.stability_days,
        stability_days_frozen: l.stability_days_frozen,
      })),
    [lines]
  );
  const stabilitySummary = useMemo(
    () => summarizeStability(stabilityItems),
    [stabilityItems]
  );
  const shipTempSummary = useMemo(
    () => summarizeShipTemp(stabilityItems),
    [stabilityItems]
  );
  const missingDataNames = useMemo(
    () => testsWithMissingData(stabilityItems),
    [stabilityItems]
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
    // Optimistic add — and refresh from server for canonical totals.
    // Intentionally do NOT clear `search` or close the list: the user
    // should be able to click additional "+" buttons from the same
    // query without retyping. Same UX as the AI Test Finder.
    const newLine: QuoteLineWithTest = {
      id: data.id,
      test_id: test.id,
      person_label: pendingPersonLabel.trim() || null,
      unit_price_cad: test.price_cad,
      test_name: test.name,
      test_sku: test.sku,
      lab_name: test.lab_name,
      ship_temp: test.ship_temp,
      stability_days: test.stability_days,
      stability_days_frozen: test.stability_days_frozen,
    };
    setLines((prev) => [...prev, newLine]);
    router.refresh();
  };

  /**
   * Toggle-add: if the test is already in the quote, remove the most
   * recently added line for that test_id; otherwise add it. Keeps the
   * search dropdown open either way.
   */
  const toggleTest = async (test: CatalogueTestForQuote) => {
    const existing = [...lines].reverse().find((l) => l.test_id === test.id);
    if (existing) {
      await removeLine(existing.id);
    } else {
      await addTest(test);
    }
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
    // Read current form state up front so we never race the DB round-
    // trip when reading client_email back from the quotes table.
    const currentEmail = email.trim();
    const currentFirstName = firstName.trim();
    const currentLastName = lastName.trim();
    if (!currentFirstName) {
      setError("Client first name is required to send the quote");
      return;
    }
    if (!currentEmail) {
      setError("Client email is required to send the quote");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one test before sending");
      return;
    }
    setSending(true);
    try {
      // Save first so totals + notes + expiry are up-to-date. Fire this
      // but continue regardless — the send endpoint receives the live
      // email/name values in the request body and persists them itself,
      // so stale DB values can't produce a false "no client email".
      if (dirty) {
        await saveDraft();
      }
      const res = await fetch(`/api/admin/quotes/${quote.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_email: currentEmail,
          client_first_name: currentFirstName,
          client_last_name: currentLastName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send quote");
        return;
      }
      setQuote((prev) => ({
        ...prev,
        client_email: currentEmail,
        client_first_name: currentFirstName,
        client_last_name: currentLastName,
        status: "sent",
        sent_at: data.sent_at,
      }));
      flash(`Quote emailed to ${currentEmail}`);
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

          <div ref={searchContainerRef} className="space-y-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: "#6ab04c" }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setIsListOpen(true);
                }}
                onFocus={() => setIsListOpen(true)}
                placeholder="Search tests by name or SKU…"
                className="mf-input pl-10 pr-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setIsListOpen(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                  style={{ color: "#6ab04c" }}
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {isListOpen && filteredCatalogue.length > 0 && (
              <div
                className="rounded-lg border divide-y"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: "#2d6b35",
                }}
              >
                {filteredCatalogue.map((t) => {
                  const isAdded = addedTestIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTest(t)}
                      aria-pressed={isAdded}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#1a3d22]"
                      style={{
                        opacity: isAdded ? 0.65 : 1,
                      }}
                    >
                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "#ffffff" }}
                        >
                          {t.name}
                        </p>
                        <p className="text-xs" style={{ color: "#6ab04c" }}>
                          {t.lab_name}
                          {t.sku && (
                            <>
                              {" · "}
                              <span>SKU: {t.sku}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isAdded ? (
                          <span
                            className="text-xs font-semibold uppercase tracking-wider"
                            style={{ color: "#8dc63f" }}
                          >
                            Added
                          </span>
                        ) : (
                          <span
                            className="text-sm font-semibold"
                            style={{ color: "#c4973a" }}
                          >
                            {formatCurrency(t.price_cad)}
                          </span>
                        )}
                        {isAdded ? (
                          <Check
                            className="w-4 h-4"
                            style={{ color: "#8dc63f" }}
                          />
                        ) : (
                          <Plus
                            className="w-4 h-4"
                            style={{ color: "#c4973a" }}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
                        {l.test_sku && (
                          <>
                            {" · "}
                            <span>SKU: {l.test_sku}</span>
                          </>
                        )}
                        {l.person_label && (
                          <>
                            {" · "}
                            <span style={{ color: "#c4973a" }}>{l.person_label}</span>
                          </>
                        )}
                      </p>
                      <StabilityLine
                        ship_temp={l.ship_temp}
                        stability_days={l.stability_days}
                        stability_days_frozen={l.stability_days_frozen}
                      />
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
                <SummaryRow
                  label="GST (5%)"
                  value={formatCurrency(liveTotals.gst_cad)}
                />
                {lines.length > 0 && (
                  <>
                    <StabilitySummaryRow summary={stabilitySummary} />
                    <ShipTempSummaryRow summary={shipTempSummary} />
                  </>
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
                    {formatCurrency(grandTotalCad(liveTotals))}
                  </td>
                </tr>
                {/* Admin-only margin row — never included in the client email */}
                {lines.length > 0 && margin.hasAnyCost && (
                  <tr>
                    <td
                      className="pt-2 mt-1 border-t text-xs italic"
                      style={{ color: "#6ab04c", borderColor: "#2d6b35" }}
                    >
                      Margin <span style={{ opacity: 0.7 }}>(internal)</span>
                      {margin.missing > 0 && (
                        <span
                          className="ml-1"
                          style={{ color: "#c4973a" }}
                          title={`${margin.missing} test${margin.missing === 1 ? "" : "s"} missing cost_cad`}
                        >
                          * some costs unavailable
                        </span>
                      )}
                    </td>
                    <td
                      className="pt-2 mt-1 border-t text-right text-xs italic"
                      style={{ color: "#6ab04c", borderColor: "#2d6b35" }}
                    >
                      {formatCurrency(margin.amount)} ({margin.pct}%)
                    </td>
                  </tr>
                )}
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

            {missingDataNames.length > 0 && (
              <div
                className="rounded-lg border p-3 mt-2 flex items-start gap-2 text-sm"
                style={{
                  backgroundColor: "rgba(249, 115, 22, 0.12)",
                  borderColor: MISSING_DATA_COLOR,
                  color: MISSING_DATA_COLOR,
                }}
                role="alert"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    This quote contains tests with missing stability or
                    ship temp data.
                  </p>
                  <p className="mt-1" style={{ color: "#e8d5a3" }}>
                    Please verify and update via the admin Tests page before
                    sending this quote to the customer. Tests affected:{" "}
                    <span style={{ color: MISSING_DATA_COLOR }}>
                      {missingDataNames.join(", ")}
                    </span>
                  </p>
                </div>
              </div>
            )}

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

function StabilityLine({
  ship_temp,
  stability_days,
  stability_days_frozen,
}: {
  ship_temp: ShipTemp | null;
  stability_days: number | null;
  stability_days_frozen: number | null;
}) {
  const stabilityText = formatStability({
    ship_temp,
    stability_days,
    stability_days_frozen,
  });
  const isIncomplete = stabilityText.startsWith("\u26A0");
  const dotColor = stabilityColorForTest({ ship_temp, stability_days });
  const shipTempMissing = !ship_temp;

  return (
    <p className="text-xs mt-0.5">
      {isIncomplete ? (
        <span
          title="Check Mayo documentation and update via admin"
          style={{ color: MISSING_DATA_COLOR }}
        >
          {stabilityText}
        </span>
      ) : (
        <span style={{ color: "#e8d5a3" }}>
          {dotColor && (
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
              style={{ backgroundColor: dotColor }}
            />
          )}
          {stabilityText}
        </span>
      )}
      {!isIncomplete && shipTempMissing && (
        <>
          {" · "}
          <span
            title="Check Mayo documentation and update via admin"
            style={{ color: MISSING_DATA_COLOR }}
          >
            Ship temp not set
          </span>
        </>
      )}
    </p>
  );
}

function StabilitySummaryRow({
  summary,
}: {
  summary: ReturnType<typeof summarizeStability>;
}) {
  if (summary.kind === "empty") return null;
  if (summary.kind === "missing") {
    const n = summary.missingNames.length;
    return (
      <tr>
        <td
          className="py-1.5 text-sm"
          style={{ color: MISSING_DATA_COLOR }}
        >
          Earliest stability limit
        </td>
        <td
          className="py-1.5 text-right text-sm font-semibold"
          style={{ color: MISSING_DATA_COLOR }}
        >
          ⚠ {n} test{n === 1 ? "" : "s"} missing stability data — cannot
          determine limit
        </td>
      </tr>
    );
  }
  const color = stabilityColorForTest({
    ship_temp: "refrigerated_only",
    stability_days: summary.minDays,
  });
  return (
    <tr>
      <td className="py-1.5 text-sm" style={{ color: "#e8d5a3" }}>
        Earliest stability limit
      </td>
      <td
        className="py-1.5 text-right text-sm font-semibold"
        style={{ color: color ?? "#ffffff" }}
      >
        {summary.minDays} days ({summary.minDaysTestName})
      </td>
    </tr>
  );
}

function ShipTempSummaryRow({
  summary,
}: {
  summary: ReturnType<typeof summarizeShipTemp>;
}) {
  if (summary.kind === "empty") return null;
  if (summary.kind === "missing") {
    const n = summary.missingNames.length;
    return (
      <tr>
        <td
          className="py-1.5 text-sm"
          style={{ color: MISSING_DATA_COLOR }}
        >
          Ship temp required
        </td>
        <td
          className="py-1.5 text-right text-sm font-semibold"
          style={{ color: MISSING_DATA_COLOR }}
        >
          ⚠ {n} test{n === 1 ? "" : "s"} missing ship temp data
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td className="py-1.5 text-sm" style={{ color: "#e8d5a3" }}>
        Ship temp required
      </td>
      <td
        className="py-1.5 text-right text-sm font-semibold"
        style={{ color: "#ffffff" }}
      >
        {formatShipTempLong(summary.strictest)}
      </td>
    </tr>
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
