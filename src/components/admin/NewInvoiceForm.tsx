"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Eye,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  renderInvoiceNotificationEmail,
  invoiceNotificationSubject,
  invoiceNotificationSmsBody,
} from "@/lib/emails/invoiceNotification";

type SupplementOption = {
  id: string;
  name: string;
  sku: string | null;
  price_cad: number;
};

type TestOption = {
  id: string;
  name: string;
  sku: string | null;
  price_cad: number;
  lab_name: string | null;
};

type CustomerSearchResult = {
  account_id: string;
  email: string | null;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

type ResolvedCustomer = CustomerSearchResult & { isNew?: boolean };

type LineType =
  | "supplement"
  | "test"
  | "custom"
  | "discount";

interface DraftLine {
  id: string;
  line_type: LineType;
  supplement_id: string | null;
  test_id: string | null;
  description: string;
  quantity: number;
  unit_price_cad: number;
}

const CURRENCY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function NewInvoiceForm({
  supplements,
  tests,
}: {
  supplements: SupplementOption[];
  tests: TestOption[];
}) {
  const router = useRouter();

  // ─── Customer state ─────────────────────────────────────────────
  const [customer, setCustomer] = useState<ResolvedCustomer | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClient, setNewClient] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    date_of_birth: "",
  });
  const [creatingClient, setCreatingClient] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // ─── Line items ────────────────────────────────────────────────
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [supplementPickerOpen, setSupplementPickerOpen] = useState(false);
  const [supplementFilter, setSupplementFilter] = useState("");
  const [testPickerOpen, setTestPickerOpen] = useState(false);
  const [testFilter, setTestFilter] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Catalogues filter in-memory — the lists ship with the server page
  // so there's no network call. Match on name + SKU + (for tests) lab
  // name. Case-insensitive, all terms must hit.
  const filteredSupplements = useMemo(() => {
    const q = supplementFilter.trim().toLowerCase();
    if (!q) return supplements;
    return supplements.filter((s) => {
      const hay = `${s.name} ${s.sku ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [supplementFilter, supplements]);
  const filteredTests = useMemo(() => {
    const q = testFilter.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => {
      const hay = `${t.name} ${t.sku ?? ""} ${t.lab_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [testFilter, tests]);

  // ─── Form state ────────────────────────────────────────────────
  const [adminNotes, setAdminNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Customer search ───────────────────────────────────────────
  useEffect(() => {
    if (customer || showNewClientForm) return;
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    const ctl = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/admin/accounts/search?q=${encodeURIComponent(term)}`, {
        signal: ctl.signal,
      })
        .then(async (r) => {
          if (!r.ok) return { results: [] };
          return r.json();
        })
        .then((data) => {
          setSearchResults((data.results ?? []) as CustomerSearchResult[]);
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [searchTerm, customer, showNewClientForm]);

  const handleSelectCustomer = (c: CustomerSearchResult) => {
    setCustomer(c);
    setSearchTerm("");
    setSearchResults([]);
    setShowNewClientForm(false);
  };

  const handleCreateNewClient = async () => {
    setClientError(null);
    if (
      !newClient.email ||
      !newClient.first_name ||
      !newClient.last_name ||
      !newClient.phone
    ) {
      setClientError("Email, first name, last name, and phone are required.");
      return;
    }
    setCreatingClient(true);
    try {
      const res = await fetch("/api/admin/accounts/new-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClient),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create client");
      }
      setCustomer({ ...data, isNew: true });
      setShowNewClientForm(false);
    } catch (err) {
      setClientError(
        err instanceof Error ? err.message : "Failed to create client",
      );
    } finally {
      setCreatingClient(false);
    }
  };

  // ─── Line manipulation ─────────────────────────────────────────
  const addSupplementLine = (s: SupplementOption) => {
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        line_type: "supplement",
        supplement_id: s.id,
        test_id: null,
        description: `${s.name}${s.sku ? ` (${s.sku})` : ""}`,
        quantity: 1,
        unit_price_cad: s.price_cad,
      },
    ]);
    setSupplementPickerOpen(false);
  };

  const addTestLine = (t: TestOption) => {
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        line_type: "test",
        supplement_id: null,
        test_id: t.id,
        description: `${t.name}${t.sku ? ` (${t.sku})` : ""}${t.lab_name ? ` — ${t.lab_name}` : ""}`,
        quantity: 1,
        unit_price_cad: t.price_cad,
      },
    ]);
    setTestPickerOpen(false);
  };

  const addCustomLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        line_type: "custom",
        supplement_id: null,
        test_id: null,
        description: "",
        quantity: 1,
        unit_price_cad: 0,
      },
    ]);
  };

  const addDiscountLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        line_type: "discount",
        supplement_id: null,
        test_id: null,
        description: "",
        quantity: 1,
        unit_price_cad: 0,
      },
    ]);
  };

  const updateLine = (id: string, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const subtotal = useMemo(
    () =>
      lines.reduce((s, l) => s + l.unit_price_cad * l.quantity, 0),
    [lines],
  );
  const taxPreview = useMemo(
    () =>
      // Preview only — Stripe re-computes authoritative GST. Skip
      // negative (discount) lines from the taxable base in the preview
      // since most discounts in practice are pre-tax.
      lines
        .filter((l) => l.unit_price_cad >= 0)
        .reduce((s, l) => s + l.unit_price_cad * l.quantity, 0) * 0.05,
    [lines],
  );
  const totalPreview = subtotal + taxPreview;

  // ─── Submit ────────────────────────────────────────────────────
  const canSubmit = !!customer && lines.length > 0 && subtotal !== 0 && !submitting;

  const onSubmit = async () => {
    if (!customer) return;
    setSubmitError(null);
    // Validate per-line description on the client so the API doesn't
    // have to bounce us back.
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].description.trim()) {
        setSubmitError(`Line ${i + 1} needs a description.`);
        return;
      }
      if (lines[i].line_type === "discount" && lines[i].unit_price_cad >= 0) {
        setSubmitError(
          `Line ${i + 1} (discount) must have a negative amount.`,
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: customer.account_id,
          profile_id: customer.profile_id,
          admin_notes: adminNotes.trim() || null,
          lines: lines.map((l) => ({
            line_type: l.line_type,
            supplement_id: l.supplement_id,
            test_id: l.test_id,
            description: l.description.trim(),
            quantity: l.quantity,
            unit_price_cad: l.unit_price_cad,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push(`/admin/invoices/${data.invoice_id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Create failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── Customer selection ─────────────────────────────────── */}
      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h2
          className="text-xs uppercase tracking-wider mb-3 font-bold"
          style={{ color: "#c4973a" }}
        >
          Customer
        </h2>
        {customer ? (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3"
            style={{
              backgroundColor: "#0f2614",
              borderColor: "#c4973a",
            }}
          >
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: "#ffffff" }}
              >
                {(customer.first_name && customer.last_name
                  ? `${customer.first_name} ${customer.last_name}`
                  : customer.email) ?? "Customer"}
                {customer.isNew && (
                  <span
                    className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: "rgba(141,198,63,0.15)",
                      color: "#8dc63f",
                    }}
                  >
                    New
                  </span>
                )}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#e8d5a3" }}>
                {customer.email ?? "—"}
              </p>
              {customer.phone && (
                <p className="text-xs" style={{ color: "#e8d5a3" }}>
                  {customer.phone}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCustomer(null)}
              className="text-xs underline"
              style={{ color: "#6ab04c" }}
            >
              Change
            </button>
          </div>
        ) : showNewClientForm ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                placeholder="Email *"
                value={newClient.email}
                onChange={(e) =>
                  setNewClient({ ...newClient, email: e.target.value })
                }
                className="mf-input text-sm"
              />
              <input
                type="tel"
                placeholder="Phone (for SMS) *"
                value={newClient.phone}
                onChange={(e) =>
                  setNewClient({ ...newClient, phone: e.target.value })
                }
                className="mf-input text-sm"
              />
              <input
                type="text"
                placeholder="First name *"
                value={newClient.first_name}
                onChange={(e) =>
                  setNewClient({ ...newClient, first_name: e.target.value })
                }
                className="mf-input text-sm"
              />
              <input
                type="text"
                placeholder="Last name *"
                value={newClient.last_name}
                onChange={(e) =>
                  setNewClient({ ...newClient, last_name: e.target.value })
                }
                className="mf-input text-sm"
              />
              <input
                type="date"
                placeholder="Date of birth (optional)"
                value={newClient.date_of_birth}
                onChange={(e) =>
                  setNewClient({
                    ...newClient,
                    date_of_birth: e.target.value,
                  })
                }
                className="mf-input text-sm"
              />
            </div>
            {clientError && (
              <p
                className="text-xs flex items-start gap-1.5"
                style={{ color: "#e05252" }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {clientError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreateNewClient}
                disabled={creatingClient}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
              >
                {creatingClient && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Create client
              </button>
              <button
                type="button"
                onClick={() => setShowNewClientForm(false)}
                className="text-xs underline"
                style={{ color: "#6ab04c" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: "#6ab04c" }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search existing client by name or email…"
                className="mf-input pl-10 text-sm"
              />
            </div>
            {searching && (
              <p className="text-xs" style={{ color: "#6ab04c" }}>
                Searching…
              </p>
            )}
            {searchResults.length > 0 && (
              <ul className="space-y-1">
                {searchResults.map((r) => (
                  <li key={r.account_id}>
                    <button
                      type="button"
                      onClick={() => handleSelectCustomer(r)}
                      className="w-full text-left rounded-lg border px-3 py-2"
                      style={{
                        backgroundColor: "#0f2614",
                        borderColor: "#2d6b35",
                      }}
                    >
                      <p
                        className="text-sm"
                        style={{ color: "#ffffff" }}
                      >
                        {r.first_name && r.last_name
                          ? `${r.first_name} ${r.last_name}`
                          : (r.email ?? "(unnamed)")}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "#6ab04c" }}
                      >
                        {r.email ?? "—"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                setShowNewClientForm(true);
                setSearchTerm("");
              }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: "#c4973a" }}
            >
              <UserPlus className="w-3.5 h-3.5" />
              New client
            </button>
          </div>
        )}
      </section>

      {/* ─── Line items ──────────────────────────────────────────── */}
      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h2
          className="text-xs uppercase tracking-wider mb-3 font-bold"
          style={{ color: "#c4973a" }}
        >
          Line items
        </h2>
        {lines.length === 0 ? (
          <p className="text-sm mb-3" style={{ color: "#6ab04c" }}>
            No lines yet. Add at least one to enable the Create button.
          </p>
        ) : (
          <ul className="space-y-2 mb-3">
            {lines.map((l, i) => (
              <li
                key={l.id}
                className="rounded-lg border p-3 space-y-2"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: "#2d6b35",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] uppercase tracking-wider font-bold"
                    style={{ color: "#6ab04c" }}
                  >
                    {l.line_type} · line {i + 1}
                  </span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => removeLine(l.id)}
                    style={{ color: "#e05252" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={l.description}
                  onChange={(e) =>
                    updateLine(l.id, { description: e.target.value })
                  }
                  placeholder="Description (visible to customer)"
                  className="mf-input text-sm"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      className="block text-[10px] uppercase mb-0.5"
                      style={{ color: "#6ab04c" }}
                    >
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) =>
                        updateLine(l.id, {
                          quantity: Math.max(1, Number(e.target.value)),
                        })
                      }
                      className="mf-input text-sm"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-[10px] uppercase mb-0.5"
                      style={{ color: "#6ab04c" }}
                    >
                      Unit price (CAD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={l.unit_price_cad}
                      onChange={(e) =>
                        updateLine(l.id, {
                          unit_price_cad: Number(e.target.value),
                        })
                      }
                      className="mf-input text-sm"
                    />
                  </div>
                  <div>
                    <label
                      className="block text-[10px] uppercase mb-0.5"
                      style={{ color: "#6ab04c" }}
                    >
                      Line total
                    </label>
                    <p
                      className="px-3 py-1.5 text-sm font-semibold"
                      style={{ color: "#c4973a" }}
                    >
                      {CURRENCY.format(l.unit_price_cad * l.quantity)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSupplementPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{
              backgroundColor: "transparent",
              borderColor: "#c4973a",
              color: "#c4973a",
            }}
          >
            <Plus className="w-3 h-3" />
            Add supplement
          </button>
          <button
            type="button"
            onClick={() => setTestPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{
              backgroundColor: "transparent",
              borderColor: "#c4973a",
              color: "#c4973a",
            }}
          >
            <Plus className="w-3 h-3" />
            Add test
          </button>
          <button
            type="button"
            onClick={addCustomLine}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{
              backgroundColor: "transparent",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            <Plus className="w-3 h-3" />
            Add custom line
          </button>
          <button
            type="button"
            onClick={addDiscountLine}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{
              backgroundColor: "transparent",
              borderColor: "#e05252",
              color: "#e05252",
            }}
          >
            <Plus className="w-3 h-3" />
            Add discount
          </button>
        </div>

        {supplementPickerOpen && (
          <div
            className="mt-3 rounded-lg border"
            style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
          >
            <div
              className="p-2 border-b"
              style={{ borderColor: "#2d6b35" }}
            >
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: "#6ab04c" }}
                />
                <input
                  type="text"
                  value={supplementFilter}
                  onChange={(e) => setSupplementFilter(e.target.value)}
                  placeholder={`Filter ${supplements.length} supplements by name or SKU…`}
                  autoFocus
                  className="mf-input text-sm pl-8 pr-2 py-1.5"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-3">
              {supplements.length === 0 ? (
                <p className="text-xs" style={{ color: "#6ab04c" }}>
                  No active supplements in the catalogue.
                </p>
              ) : filteredSupplements.length === 0 ? (
                <p className="text-xs" style={{ color: "#6ab04c" }}>
                  No matches for &ldquo;{supplementFilter}&rdquo;.
                </p>
              ) : (
                <ul className="space-y-1">
                  {filteredSupplements.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => addSupplementLine(s)}
                        className="w-full text-left flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-[#1a3d22]"
                      >
                        <span
                          className="text-sm"
                          style={{ color: "#ffffff" }}
                        >
                          {s.name}
                          {s.sku && (
                            <span
                              className="ml-2 text-xs font-mono"
                              style={{ color: "#6ab04c" }}
                            >
                              {s.sku}
                            </span>
                          )}
                        </span>
                        <span
                          className="text-xs font-semibold"
                          style={{ color: "#c4973a" }}
                        >
                          {CURRENCY.format(s.price_cad)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {testPickerOpen && (
          <div
            className="mt-3 rounded-lg border"
            style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
          >
            <div
              className="p-2 border-b"
              style={{ borderColor: "#2d6b35" }}
            >
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: "#6ab04c" }}
                />
                <input
                  type="text"
                  value={testFilter}
                  onChange={(e) => setTestFilter(e.target.value)}
                  placeholder={`Filter ${tests.length} tests by name, SKU, or lab…`}
                  autoFocus
                  className="mf-input text-sm pl-8 pr-2 py-1.5"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-3">
              {tests.length === 0 ? (
                <p className="text-xs" style={{ color: "#6ab04c" }}>
                  No active tests in the catalogue.
                </p>
              ) : filteredTests.length === 0 ? (
                <p className="text-xs" style={{ color: "#6ab04c" }}>
                  No matches for &ldquo;{testFilter}&rdquo;.
                </p>
              ) : (
                <ul className="space-y-1">
                  {filteredTests.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => addTestLine(t)}
                        className="w-full text-left flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-[#1a3d22]"
                      >
                        <span
                          className="text-sm"
                          style={{ color: "#ffffff" }}
                        >
                          {t.name}
                          {t.sku && (
                            <span
                              className="ml-2 text-xs font-mono"
                              style={{ color: "#6ab04c" }}
                            >
                              {t.sku}
                            </span>
                          )}
                          {t.lab_name && (
                            <span
                              className="ml-2 text-xs"
                              style={{ color: "#8dc63f" }}
                            >
                              · {t.lab_name}
                            </span>
                          )}
                        </span>
                        <span
                          className="text-xs font-semibold"
                          style={{ color: "#c4973a" }}
                        >
                          {CURRENCY.format(t.price_cad)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ─── Notes + totals + submit ────────────────────────────── */}
      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h2
          className="text-xs uppercase tracking-wider mb-3 font-bold"
          style={{ color: "#c4973a" }}
        >
          Internal notes (not shown to customer)
        </h2>
        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Optional admin context (e.g. context for refund disputes later)"
          rows={2}
          className="mf-input text-sm"
        />
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <dl className="space-y-1 text-sm" style={{ color: "#e8d5a3" }}>
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{CURRENCY.format(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>GST 5% (preview — Stripe Tax computes final)</dt>
            <dd>{CURRENCY.format(taxPreview)}</dd>
          </div>
          <div
            className="flex justify-between text-lg font-bold pt-2 border-t"
            style={{ borderColor: "#2d6b35", color: "#c4973a" }}
          >
            <dt>Total (preview)</dt>
            <dd>{CURRENCY.format(totalPreview)}</dd>
          </div>
        </dl>

        {submitError && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{
              backgroundColor: "rgba(224,82,82,0.12)",
              borderColor: "#e05252",
              color: "#e05252",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={!customer || lines.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "transparent",
              borderColor: "#c4973a",
              color: "#c4973a",
            }}
          >
            <Eye className="w-4 h-4" />
            Preview invoice
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Create and Send Invoice
          </button>
        </div>
      </section>

      {previewOpen && customer && (
        <PreviewModal
          customer={customer}
          lines={lines}
          subtotalPreview={subtotal}
          taxPreview={taxPreview}
          totalPreview={totalPreview}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Preview modal ────────────────────────────────────────────────────
//
// Renders the exact email body (via the shared template) plus the SMS
// the customer would receive. The hosted-Stripe invoice page itself
// can't be previewed pre-creation — that comes from Stripe's API after
// finalisation — so we show the rendered email + SMS preview, the
// total breakdown, and a note describing where the Stripe page link
// will appear.

function PreviewModal({
  customer,
  lines,
  subtotalPreview,
  taxPreview,
  totalPreview,
  onClose,
}: {
  customer: ResolvedCustomer;
  lines: DraftLine[];
  subtotalPreview: number;
  taxPreview: number;
  totalPreview: number;
  onClose: () => void;
}) {
  const firstName = customer.first_name ?? "there";
  const fakeInvoiceNumber = "AVO-XXXX"; // assigned by the server on submit
  const fakeHostedUrl = "https://invoice.stripe.com/i/acct_…/…";
  const emailHtml = renderInvoiceNotificationEmail({
    firstName,
    invoiceNumber: fakeInvoiceNumber,
    totalCad: totalPreview,
    subtotalCad: subtotalPreview,
    taxCad: taxPreview,
    hostedInvoiceUrl: fakeHostedUrl,
    lines: lines.map((l) => ({
      description: l.description || "(line description)",
      quantity: l.quantity,
      unitPriceCad: l.unit_price_cad,
    })),
    invoiceType: "products",
  });
  const subject = invoiceNotificationSubject(fakeInvoiceNumber, "products");
  const smsBody = invoiceNotificationSmsBody({
    firstName,
    invoiceNumber: fakeInvoiceNumber,
    totalCad: totalPreview,
    hostedInvoiceUrl: fakeHostedUrl,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl border max-w-3xl w-full max-h-[90vh] flex flex-col"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between p-5 border-b"
          style={{ borderColor: "#2d6b35" }}
        >
          <h2
            className="font-heading text-xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Invoice preview
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            style={{ color: "#e8d5a3" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <p
            className="text-xs leading-relaxed rounded-lg border px-3 py-2"
            style={{
              backgroundColor: "rgba(196, 151, 58, 0.10)",
              borderColor: "#c4973a",
              color: "#e8d5a3",
            }}
          >
            <strong style={{ color: "#c4973a" }}>Preview only.</strong>{" "}
            The real invoice number ({fakeInvoiceNumber}) and Stripe
            hosted URL are assigned by the server when you click
            <em> Create and Send Invoice</em>. The total below is a
            preview using a 5% GST estimate — Stripe Tax computes the
            authoritative value at finalisation.
          </p>

          <section>
            <h3
              className="text-xs uppercase tracking-wider mb-2 font-bold"
              style={{ color: "#c4973a" }}
            >
              Email recipient
            </h3>
            <p className="text-sm" style={{ color: "#ffffff" }}>
              {customer.email ?? "(no email on file)"}
            </p>
            <p
              className="text-xs mt-2 uppercase tracking-wider font-bold"
              style={{ color: "#c4973a" }}
            >
              Subject
            </p>
            <p className="text-sm" style={{ color: "#e8d5a3" }}>
              {subject}
            </p>
          </section>

          <section>
            <h3
              className="text-xs uppercase tracking-wider mb-2 font-bold"
              style={{ color: "#c4973a" }}
            >
              Email body
            </h3>
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: "#2d6b35" }}
            >
              <iframe
                title="Invoice email preview"
                srcDoc={emailHtml}
                sandbox=""
                className="w-full"
                style={{
                  height: "480px",
                  backgroundColor: "#ffffff",
                  border: "none",
                }}
              />
            </div>
          </section>

          <section>
            <h3
              className="text-xs uppercase tracking-wider mb-2 font-bold"
              style={{ color: "#c4973a" }}
            >
              SMS{" "}
              <span
                className="text-[10px] font-normal normal-case"
                style={{ color: "#6ab04c" }}
              >
                — to {customer.phone ?? "(no phone on file)"}
              </span>
            </h3>
            {customer.phone ? (
              <div
                className="rounded-lg border px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: "#2d6b35",
                  color: "#e8d5a3",
                }}
              >
                {smsBody}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "#6ab04c" }}>
                No phone on file — SMS will not be sent.
              </p>
            )}
          </section>

          <section>
            <h3
              className="text-xs uppercase tracking-wider mb-2 font-bold"
              style={{ color: "#c4973a" }}
            >
              Totals preview
            </h3>
            <dl className="text-sm space-y-1" style={{ color: "#e8d5a3" }}>
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{CURRENCY.format(subtotalPreview)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>GST 5% (estimate — Stripe finalises)</dt>
                <dd>{CURRENCY.format(taxPreview)}</dd>
              </div>
              <div
                className="flex justify-between text-base font-bold pt-1 border-t"
                style={{ borderColor: "#2d6b35", color: "#c4973a" }}
              >
                <dt>Total</dt>
                <dd>{CURRENCY.format(totalPreview)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div
          className="p-5 border-t flex justify-end"
          style={{ borderColor: "#2d6b35" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold border"
            style={{
              backgroundColor: "transparent",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            Close preview
          </button>
        </div>
      </div>
    </div>
  );
}
