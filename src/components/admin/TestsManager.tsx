"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Edit2,
  X,
  Loader2,
  AlertCircle,
  Check,
  Sparkles,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency, slugify } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { InsightsChatModal } from "@/components/catalogue/InsightsChatModal";
import type {
  AdminTestRow,
  AdminLabRow,
} from "@/app/(admin)/admin/tests/page";

interface TestsManagerProps {
  initialTests: AdminTestRow[];
  labs: AdminLabRow[];
}

type EditableFields = {
  name: string;
  description: string;
  category: string;
  price_cad: string;
  cost_cad: string;
  specimen_type: string;
  ship_temp: string;
  stability_notes: string;
  turnaround_display: string;
  turnaround_min_days: string;
  turnaround_max_days: string;
  lab_id: string;
  sku: string;
  mayo_test_id: string;
};

const EMPTY_FORM: EditableFields = {
  name: "",
  description: "",
  category: "",
  price_cad: "",
  cost_cad: "",
  specimen_type: "",
  ship_temp: "",
  stability_notes: "",
  turnaround_display: "",
  turnaround_min_days: "",
  turnaround_max_days: "",
  lab_id: "",
  sku: "",
  mayo_test_id: "",
};

const MAYO_URL_BASE = "https://mayocliniclabs.com/test-catalog/overview/";

export function TestsManager({ initialTests, labs }: TestsManagerProps) {
  const [tests, setTests] = useState<AdminTestRow[]>(initialTests);
  const [searchQuery, setSearchQuery] = useState("");
  const [labFilter, setLabFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const scrollToTest = (testId: string) => {
    const el = document.getElementById(`test-${testId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const categories = useMemo(() => {
    return Array.from(
      new Set(tests.map((t) => t.category).filter((c): c is string => !!c))
    ).sort();
  }, [tests]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tests.filter((t) => {
      if (q) {
        const matches =
          t.name.toLowerCase().includes(q) ||
          (!!t.sku && t.sku.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (labFilter !== "all" && t.lab_id !== labFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter)
        return false;
      if (featuredOnly && !t.featured) return false;
      return true;
    });
  }, [tests, searchQuery, labFilter, categoryFilter, featuredOnly]);

  const updateStock = async (testId: string, newQty: number) => {
    const safeQty = Math.max(0, Math.floor(newQty));
    const res = await fetch("/api/admin/tests/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test_id: testId, stock_qty: safeQty }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      alert(`Failed to update stock: ${data.error ?? res.statusText}`);
      return;
    }
    setTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, stock_qty: safeQty } : t))
    );
  };

  const toggleField = async (
    test: AdminTestRow,
    field: "active" | "featured"
  ) => {
    const newValue = !test[field];
    const supabase = createClient();
    const { error } = await supabase
      .from("tests")
      .update({ [field]: newValue })
      .eq("id", test.id);

    if (error) {
      alert(`Failed to update: ${error.message}`);
      return;
    }

    setTests((prev) =>
      prev.map((t) => (t.id === test.id ? { ...t, [field]: newValue } : t))
    );
  };

  const saveEdit = async (testId: string, fields: EditableFields) => {
    const supabase = createClient();
    const payload = {
      name: fields.name,
      description: fields.description || null,
      category: fields.category || null,
      price_cad: fields.price_cad ? parseFloat(fields.price_cad) : null,
      cost_cad: fields.cost_cad ? parseFloat(fields.cost_cad) : null,
      specimen_type: fields.specimen_type || null,
      ship_temp: fields.ship_temp || null,
      stability_notes: fields.stability_notes || null,
      turnaround_display: fields.turnaround_display || null,
      turnaround_min_days: fields.turnaround_min_days
        ? parseInt(fields.turnaround_min_days, 10)
        : null,
      turnaround_max_days: fields.turnaround_max_days
        ? parseInt(fields.turnaround_max_days, 10)
        : null,
      lab_id: fields.lab_id,
      sku: fields.sku || null,
      mayo_test_id: fields.mayo_test_id || null,
    };

    const { error } = await supabase
      .from("tests")
      .update(payload)
      .eq("id", testId);

    if (error) {
      throw new Error(error.message);
    }

    const lab = labs.find((l) => l.id === fields.lab_id) ?? {
      id: fields.lab_id,
      name: "—",
    };

    setTests((prev) =>
      prev.map((t) =>
        t.id === testId
          ? ({ ...t, ...payload, lab } as AdminTestRow)
          : t
      )
    );
    setEditingId(null);
  };

  const deactivateTest = async (testId: string) => {
    const res = await fetch(`/api/admin/tests/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to deactivate test");
    }
    setTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, active: false } : t))
    );
    setEditingId(null);
  };

  const deleteTest = async (
    testId: string
  ): Promise<{ action: "deleted" | "deactivated"; message?: string }> => {
    const res = await fetch(`/api/admin/tests/${testId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to delete test");
    }
    if (data.action === "deleted") {
      setTests((prev) => prev.filter((t) => t.id !== testId));
    } else {
      // Server fell back to deactivation because order_lines exist.
      setTests((prev) =>
        prev.map((t) => (t.id === testId ? { ...t, active: false } : t))
      );
    }
    setEditingId(null);
    return {
      action: data.action as "deleted" | "deactivated",
      message: data.message as string | undefined,
    };
  };

  const createTest = async (fields: EditableFields) => {
    const supabase = createClient();
    const slug = slugify(fields.name);
    const payload = {
      name: fields.name,
      slug,
      description: fields.description || null,
      category: fields.category || null,
      price_cad: fields.price_cad ? parseFloat(fields.price_cad) : null,
      cost_cad: fields.cost_cad ? parseFloat(fields.cost_cad) : null,
      specimen_type: fields.specimen_type || null,
      ship_temp: fields.ship_temp || null,
      stability_notes: fields.stability_notes || null,
      turnaround_display: fields.turnaround_display || null,
      turnaround_min_days: fields.turnaround_min_days
        ? parseInt(fields.turnaround_min_days, 10)
        : null,
      turnaround_max_days: fields.turnaround_max_days
        ? parseInt(fields.turnaround_max_days, 10)
        : null,
      lab_id: fields.lab_id,
      sku: fields.sku || null,
      mayo_test_id: fields.mayo_test_id || null,
      active: true,
      featured: false,
    };

    const { data, error } = await supabase
      .from("tests")
      .insert(payload)
      .select(
        `
        id, lab_id, name, slug, description, category, price_cad,
        turnaround_display, turnaround_min_days, turnaround_max_days,
        turnaround_note, specimen_type, ship_temp,
        stability_notes, active, featured, created_at, updated_at,
        sku, mayo_test_id, cost_cad,
        track_inventory, stock_qty, low_stock_threshold
      `
      )
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create test");
    }

    const lab = labs.find((l) => l.id === fields.lab_id) ?? {
      id: fields.lab_id,
      name: "—",
    };

    setTests((prev) => [
      { ...(data as unknown as Omit<AdminTestRow, "lab">), lab },
      ...prev,
    ]);
    setCreating(false);
  };

  return (
    <>
      {/* Filter row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "#6ab04c" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by test name or SKU…"
            className="mf-input pl-10"
          />
        </div>
        <select
          value={labFilter}
          onChange={(e) => setLabFilter(e.target.value)}
          className="mf-input sm:max-w-[200px] cursor-pointer"
        >
          <option value="all">All Labs</option>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="mf-input sm:max-w-[200px] cursor-pointer"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label
          className="flex items-center gap-2 px-3 rounded-lg border cursor-pointer shrink-0"
          style={{
            backgroundColor: featuredOnly ? "#1a3d22" : "transparent",
            borderColor: featuredOnly ? "#c4973a" : "#2d6b35",
          }}
        >
          <input
            type="checkbox"
            checked={featuredOnly}
            onChange={(e) => setFeaturedOnly(e.target.checked)}
            className="cursor-pointer"
            style={{ accentColor: "#c4973a" }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: featuredOnly ? "#c4973a" : "#e8d5a3" }}
          >
            Featured only
          </span>
        </label>
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors shrink-0"
          style={{
            backgroundColor: "transparent",
            borderColor: "#c4973a",
            color: "#c4973a",
          }}
        >
          <Sparkles className="w-4 h-4" />
          AI Test Finder
        </button>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <Plus className="w-4 h-4" />
          {creating ? "Cancel New" : "Add New Test"}
        </button>
      </div>

      {/* New test inline form */}
      {creating && (
        <div className="mb-4">
          <InlineTestForm
            mode="create"
            labs={labs}
            categories={categories}
            initialFields={EMPTY_FORM}
            onCancel={() => setCreating(false)}
            onSubmit={createTest}
          />
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {[
                  "Name",
                  "SKU",
                  "Lab",
                  "Category",
                  "Ship Temp",
                  "Stability",
                  "Cost",
                  "Client Price",
                  "Margin",
                  "Active",
                  "Featured",
                  "",
                ].map((h, i) => (
                  <th
                    key={i}
                    className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider"
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
                    colSpan={12}
                    className="px-6 py-16 text-center"
                    style={{
                      backgroundColor: "#0a1a0d",
                      color: "#6ab04c",
                    }}
                  >
                    {tests.length === 0
                      ? "No tests yet"
                      : "No tests match your filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((test, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const isEditing = editingId === test.id;

                  return (
                    <TestRow
                      key={test.id}
                      test={test}
                      rowBg={rowBg}
                      labs={labs}
                      categories={categories}
                      isEditing={isEditing}
                      onEdit={() => setEditingId(test.id)}
                      onCancel={() => setEditingId(null)}
                      onToggle={toggleField}
                      onSave={(fields) => saveEdit(test.id, fields)}
                      onUpdateStock={updateStock}
                      onDeactivate={() => deactivateTest(test.id)}
                      onDelete={() => deleteTest(test.id)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-right" style={{ color: "#6ab04c" }}>
        Showing {filtered.length} of {tests.length} tests
      </p>

      <InsightsChatModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onScrollToTest={scrollToTest}
      />
    </>
  );
}

// ─── Row + inline edit ──────────────────────────────────────────────────

function TestRow({
  test,
  rowBg,
  labs,
  categories,
  isEditing,
  onEdit,
  onCancel,
  onToggle,
  onSave,
  onUpdateStock,
  onDeactivate,
  onDelete,
}: {
  test: AdminTestRow;
  rowBg: string;
  labs: AdminLabRow[];
  categories: string[];
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onToggle: (test: AdminTestRow, field: "active" | "featured") => void;
  onSave: (fields: EditableFields) => Promise<void>;
  onUpdateStock: (testId: string, newQty: number) => Promise<void>;
  onDeactivate: () => Promise<void>;
  onDelete: () => Promise<{ action: "deleted" | "deactivated"; message?: string }>;
}) {
  const initialFields: EditableFields = {
    name: test.name,
    description: test.description ?? "",
    category: test.category ?? "",
    price_cad: test.price_cad != null ? String(test.price_cad) : "",
    cost_cad: test.cost_cad != null ? String(test.cost_cad) : "",
    specimen_type: test.specimen_type ?? "",
    ship_temp: test.ship_temp ?? "",
    stability_notes: test.stability_notes ?? "",
    turnaround_display: test.turnaround_display ?? "",
    turnaround_min_days:
      test.turnaround_min_days != null ? String(test.turnaround_min_days) : "",
    turnaround_max_days:
      test.turnaround_max_days != null ? String(test.turnaround_max_days) : "",
    lab_id: test.lab_id,
    sku: test.sku ?? "",
    mayo_test_id: test.mayo_test_id ?? "",
  };

  return (
    <>
      <tr
        id={`test-${test.id}`}
        style={{
          backgroundColor: rowBg,
          borderTop: "1px solid #1a3d22",
        }}
      >
        <td className="px-5 py-4 font-medium" style={{ color: "#ffffff" }}>
          <div>{test.name}</div>
          {test.track_inventory && <StockBadge test={test} />}
        </td>
        <td
          className="px-3 py-4 whitespace-nowrap"
          style={{ color: "#ffffff" }}
        >
          {test.sku ?? "—"}
        </td>
        <td className="px-5 py-4" style={{ color: "#e8d5a3" }}>
          {test.lab.name}
        </td>
        <td className="px-5 py-4" style={{ color: "#e8d5a3" }}>
          {test.category ?? "—"}
        </td>
        <td
          className="px-4 py-4 text-xs whitespace-nowrap"
          style={{ color: "#e8d5a3" }}
          title={test.ship_temp ?? ""}
        >
          {test.ship_temp ?? "—"}
        </td>
        <td
          className="px-4 py-4 text-xs"
          style={{ color: "#e8d5a3" }}
          title={test.stability_notes ?? ""}
        >
          <div className="flex items-center gap-1">
            <span>{extractDuration(test.stability_notes)}</span>
            {test.stability_notes && (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold shrink-0"
                style={{
                  backgroundColor: "rgba(196,151,58,0.2)",
                  color: "#c4973a",
                  border: "1px solid #c4973a",
                }}
                aria-label="Hover for full stability notes"
              >
                i
              </span>
            )}
          </div>
        </td>
        <td
          className="px-5 py-4 whitespace-nowrap"
          style={{ color: "#e8d5a3" }}
        >
          {test.cost_cad != null ? formatCurrency(test.cost_cad) : "—"}
        </td>
        <td
          className="px-5 py-4 font-semibold whitespace-nowrap"
          style={{ color: "#c4973a" }}
        >
          {test.price_cad != null ? formatCurrency(test.price_cad) : "—"}
        </td>
        <td className="px-5 py-4 font-semibold whitespace-nowrap">
          <MarginCell price={test.price_cad} cost={test.cost_cad} />
        </td>
        <td className="px-5 py-4">
          <ToggleSwitch
            on={test.active}
            onClick={() => onToggle(test, "active")}
            label="Active"
            onLabel="Active"
            offLabel="Inactive"
          />
        </td>
        <td className="px-5 py-4">
          <ToggleSwitch
            on={test.featured}
            onClick={() => onToggle(test, "featured")}
            label="Featured"
            onLabel="Featured"
            offLabel="Not Featured"
          />
        </td>
        <td className="px-5 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            {test.mayo_test_id && (
              <a
                href={`${MAYO_URL_BASE}${test.mayo_test_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  color: "#8dc63f",
                  border: "1px solid #2d6b35",
                  backgroundColor: "transparent",
                }}
              >
                Mayo ↗
              </a>
            )}
          <button
            onClick={isEditing ? onCancel : onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              color: "#c4973a",
              border: "1px solid #2d6b35",
              backgroundColor: "transparent",
            }}
          >
            {isEditing ? (
              <>
                <X className="w-3.5 h-3.5" />
                Close
              </>
            ) : (
              <>
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </>
            )}
          </button>
          </div>
        </td>
      </tr>

      {isEditing && (
        <tr style={{ backgroundColor: rowBg }}>
          <td colSpan={12} className="p-0">
            <div
              className="px-6 py-5 border-t"
              style={{
                borderColor: "#2d6b35",
                backgroundColor: "#0f2614",
              }}
            >
              <InlineTestForm
                mode="edit"
                labs={labs}
                categories={categories}
                initialFields={initialFields}
                onCancel={onCancel}
                onSubmit={onSave}
                stockTest={test}
                onUpdateStock={onUpdateStock}
                onDeactivate={onDeactivate}
                onDelete={onDelete}
                testName={test.name}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function extractDuration(notes: string | null): string {
  if (!notes) return "—";
  const m = notes.match(/(\d+)\s*(days?|hours?|weeks?)/i);
  return m ? `${m[1]} ${m[2].toLowerCase()}` : "—";
}

// ─── Margin cell ────────────────────────────────────────────────────────

function MarginCell({
  price,
  cost,
}: {
  price: number | null;
  cost: number | null;
}) {
  if (price == null || cost == null) {
    return <span style={{ color: "#6ab04c" }}>—</span>;
  }
  const margin = price - cost;
  const color =
    margin >= 50 ? "#8dc63f" : margin >= 20 ? "#c4973a" : "#e05252";
  return <span style={{ color }}>{formatCurrency(margin)}</span>;
}

// ─── Stock badge (display-only, in Name cell) ───────────────────────────

function StockBadge({ test }: { test: AdminTestRow }) {
  const qty = test.stock_qty ?? 0;
  const threshold = test.low_stock_threshold ?? 2;
  const color =
    qty === 0 ? "#e05252" : qty <= threshold ? "#c4973a" : "#8dc63f";
  return (
    <div style={{ color, fontSize: "11px" }}>Stock: {qty}</div>
  );
}

// ─── Stock cell ─────────────────────────────────────────────────────────

function StockCell({
  test,
  onUpdateStock,
}: {
  test: AdminTestRow;
  onUpdateStock: (testId: string, newQty: number) => Promise<void>;
}) {
  const [input, setInput] = useState<string>(
    test.stock_qty != null ? String(test.stock_qty) : ""
  );
  const [busy, setBusy] = useState(false);

  if (!test.track_inventory) {
    return <span style={{ color: "#6ab04c" }}>—</span>;
  }

  const qty = test.stock_qty ?? 0;
  const threshold = test.low_stock_threshold ?? 2;
  const isOut = qty === 0;
  const isLow = !isOut && qty <= threshold;

  const color = isOut ? "#e05252" : isLow ? "#c4973a" : "#8dc63f";

  const step = async (delta: number) => {
    setBusy(true);
    try {
      const next = Math.max(0, qty + delta);
      await onUpdateStock(test.id, next);
      setInput(String(next));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const parsed = parseInt(input, 10);
    if (!Number.isFinite(parsed)) {
      setInput(String(qty));
      return;
    }
    if (parsed === qty) return;
    setBusy(true);
    try {
      await onUpdateStock(test.id, parsed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={busy || qty === 0}
        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
        style={{
          backgroundColor: "#2d6b35",
          color: "#e8d5a3",
          opacity: busy || qty === 0 ? 0.4 : 1,
        }}
        aria-label="Decrease stock"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={busy}
        className="w-14 text-center rounded border text-sm font-semibold"
        style={{
          backgroundColor: "#0f2614",
          borderColor: color,
          color,
          padding: "2px 4px",
        }}
      />
      <button
        type="button"
        onClick={() => step(1)}
        disabled={busy}
        className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold"
        style={{
          backgroundColor: "#2d6b35",
          color: "#e8d5a3",
          opacity: busy ? 0.4 : 1,
        }}
        aria-label="Increase stock"
      >
        +
      </button>
    </div>
  );
}

// ─── Toggle switch ──────────────────────────────────────────────────────

function ToggleSwitch({
  on,
  onClick,
  label,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  onLabel?: string;
  offLabel?: string;
}) {
  const visibleLabel = on ? (onLabel ?? label) : (offLabel ?? "Off");
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="inline-flex items-center gap-1.5"
    >
      <span
        className="relative inline-block w-9 h-5 rounded-full transition-colors shrink-0"
        style={{
          backgroundColor: on ? "#8dc63f" : "#2d6b35",
        }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
          style={{
            backgroundColor: on ? "#0a1a0d" : "#e8d5a3",
            transform: on ? "translateX(18px)" : "translateX(2px)",
          }}
        />
      </span>
      <span className="text-sm whitespace-nowrap" style={{ color: "#ffffff" }}>
        {visibleLabel}
      </span>
    </button>
  );
}

// ─── Inline form (shared by create + edit) ──────────────────────────────

function InlineTestForm({
  mode,
  labs,
  categories,
  initialFields,
  onCancel,
  onSubmit,
  stockTest,
  onUpdateStock,
  onDeactivate,
  onDelete,
  testName,
}: {
  mode: "create" | "edit";
  labs: AdminLabRow[];
  categories: string[];
  initialFields: EditableFields;
  onCancel: () => void;
  onSubmit: (fields: EditableFields) => Promise<void>;
  stockTest?: AdminTestRow;
  onUpdateStock?: (testId: string, newQty: number) => Promise<void>;
  onDeactivate?: () => Promise<void>;
  onDelete?: () => Promise<{ action: "deleted" | "deactivated"; message?: string }>;
  testName?: string;
}) {
  const [fields, setFields] = useState<EditableFields>(initialFields);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState<
    null | "deactivate" | "delete"
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const update = <K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K]
  ) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fields.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!fields.lab_id) {
      setError("Lab is required");
      return;
    }
    if (!fields.category.trim()) {
      setError(
        "Category is required — pick from the dropdown or choose 'Add new category'."
      );
      return;
    }
    setSaving(true);
    try {
      await onSubmit(fields);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border p-5 space-y-4"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <h3
        className="font-heading text-lg font-semibold"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        {mode === "create" ? "New Test" : "Edit Test"}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name" required>
          <input
            type="text"
            value={fields.name}
            onChange={(e) => update("name", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Lab" required>
          <select
            value={fields.lab_id}
            onChange={(e) => update("lab_id", e.target.value)}
            className="mf-input cursor-pointer"
          >
            <option value="">Select lab…</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Category"
          required
          helper="Pick an existing category to keep the taxonomy consistent. Use 'Add new category' only when no existing one fits."
        >
          <CategoryPicker
            value={fields.category}
            categories={categories}
            onChange={(next) => update("category", next)}
          />
        </Field>
        <Field label="SKU">
          <input
            type="text"
            value={fields.sku}
            onChange={(e) => update("sku", e.target.value)}
            className="mf-input"
            placeholder="e.g. AVO-12345"
          />
        </Field>
        <Field
          label="Mayo Test ID"
          helper="Numeric ID from mayocliniclabs.com URL (e.g. 63416)"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={fields.mayo_test_id}
              onChange={(e) => update("mayo_test_id", e.target.value)}
              className="mf-input"
              placeholder="63416"
            />
            {fields.mayo_test_id.trim() && (
              <a
                href={`${MAYO_URL_BASE}${fields.mayo_test_id.trim()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold whitespace-nowrap"
                style={{ color: "#8dc63f" }}
              >
                View on Mayo ↗
              </a>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (CAD)">
            <input
              type="number"
              step="0.01"
              value={fields.price_cad}
              onChange={(e) => update("price_cad", e.target.value)}
              className="mf-input"
            />
          </Field>
          <Field label="Cost (CAD)">
            <input
              type="number"
              step="0.01"
              value={fields.cost_cad}
              onChange={(e) => update("cost_cad", e.target.value)}
              className="mf-input"
            />
          </Field>
        </div>
        <Field label="Specimen Type">
          <input
            type="text"
            value={fields.specimen_type}
            onChange={(e) => update("specimen_type", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Ship Temperature">
          <ShipTempSelect
            value={fields.ship_temp}
            onChange={(next) => update("ship_temp", next)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Turnaround min (days)">
            <input
              type="number"
              value={fields.turnaround_min_days}
              onChange={(e) => update("turnaround_min_days", e.target.value)}
              className="mf-input"
            />
          </Field>
          <Field label="Turnaround max (days)">
            <input
              type="number"
              value={fields.turnaround_max_days}
              onChange={(e) => update("turnaround_max_days", e.target.value)}
              className="mf-input"
            />
          </Field>
        </div>
      </div>

      <Field label="Turnaround Display">
        <input
          type="text"
          value={fields.turnaround_display}
          onChange={(e) => update("turnaround_display", e.target.value)}
          className="mf-input"
          placeholder="e.g. Days performed: Mon-Fri | Report available: 1-3 days | Fasting: Yes"
        />
      </Field>

      <Field label="Description">
        <textarea
          value={fields.description}
          onChange={(e) => update("description", e.target.value)}
          className="mf-input"
          rows={3}
        />
      </Field>

      <Field label="Stability Notes">
        <textarea
          value={fields.stability_notes}
          onChange={(e) => update("stability_notes", e.target.value)}
          className="mf-input"
          rows={2}
        />
      </Field>

      {stockTest && stockTest.track_inventory && onUpdateStock && (
        <Field label="Stock">
          <StockCell test={stockTest} onUpdateStock={onUpdateStock} />
        </Field>
      )}

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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{
            backgroundColor: "#c4973a",
            color: "#0a1a0d",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {savedFlash && <Check className="w-4 h-4" />}
          {saving ? "Saving…" : savedFlash ? "Saved" : mode === "create" ? "Create" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold border transition-colors"
          style={{
            color: "#e8d5a3",
            borderColor: "#2d6b35",
            backgroundColor: "transparent",
          }}
        >
          Cancel
        </button>
      </div>

      {/* Danger zone — only in edit mode, visually separated from the
          main action row so it can't be clicked by muscle memory. */}
      {mode === "edit" && onDeactivate && onDelete && (
        <div
          className="mt-6 rounded-lg border p-4"
          style={{
            borderColor: "#e05252",
            backgroundColor: "rgba(224, 82, 82, 0.06)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" style={{ color: "#e05252" }} />
            <h4
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: "#e05252" }}
            >
              Danger Zone
            </h4>
          </div>

          {!confirmingDelete ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs" style={{ color: "#e8d5a3" }}>
                Remove this test from the catalogue. If it has been
                ordered, it will be deactivated instead of deleted.
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(true);
                  setDeleteError(null);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0"
                style={{
                  backgroundColor: "transparent",
                  color: "#e05252",
                  border: "1px solid #e05252",
                }}
              >
                <Trash2 className="w-4 h-4" />
                Delete test…
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: "#ffffff" }}>
                Are you sure you want to delete{" "}
                <strong style={{ color: "#e05252" }}>
                  {testName ?? "this test"}
                </strong>
                ? This cannot be undone. If this test has been ordered by
                clients, consider deactivating it instead.
              </p>

              {deleteError && (
                <div
                  className="flex items-center gap-2 p-3 rounded-lg text-sm border"
                  style={{
                    backgroundColor: "rgba(224, 82, 82, 0.12)",
                    borderColor: "#e05252",
                    color: "#e05252",
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {deleteError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                {/* Safer default — gold primary button */}
                <button
                  type="button"
                  disabled={deleteBusy !== null}
                  onClick={async () => {
                    setDeleteError(null);
                    setDeleteBusy("deactivate");
                    try {
                      await onDeactivate();
                    } catch (err) {
                      setDeleteError(
                        err instanceof Error
                          ? err.message
                          : "Failed to deactivate test"
                      );
                      setDeleteBusy(null);
                    }
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: "#c4973a",
                    color: "#0a1a0d",
                    opacity: deleteBusy !== null ? 0.6 : 1,
                  }}
                >
                  {deleteBusy === "deactivate" && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Deactivate instead (recommended)
                </button>

                {/* Destructive — red outline button */}
                <button
                  type="button"
                  disabled={deleteBusy !== null}
                  onClick={async () => {
                    setDeleteError(null);
                    setDeleteBusy("delete");
                    try {
                      const result = await onDelete();
                      if (result.action === "deactivated" && result.message) {
                        // Server fell back — tell the admin why.
                        alert(result.message);
                      }
                    } catch (err) {
                      setDeleteError(
                        err instanceof Error
                          ? err.message
                          : "Failed to delete test"
                      );
                      setDeleteBusy(null);
                    }
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: "transparent",
                    color: "#e05252",
                    border: "1px solid #e05252",
                    opacity: deleteBusy !== null ? 0.6 : 1,
                  }}
                >
                  {deleteBusy === "delete" && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  <Trash2 className="w-4 h-4" />
                  Delete permanently
                </button>

                <button
                  type="button"
                  disabled={deleteBusy !== null}
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteError(null);
                  }}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors"
                  style={{
                    color: "#e8d5a3",
                    borderColor: "#2d6b35",
                    backgroundColor: "transparent",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

/**
 * ShipTempSelect — canonical shipping temperatures. We preserve any
 * legacy non-canonical value as a selectable "(legacy)" option so
 * older tests don't silently lose their data, but new selections
 * must be one of the three canonical values.
 */
const SHIP_TEMP_OPTIONS = ["Ambient", "Refrigerated", "Frozen"] as const;

function ShipTempSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const isLegacy =
    value !== "" && !SHIP_TEMP_OPTIONS.includes(value as (typeof SHIP_TEMP_OPTIONS)[number]);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mf-input cursor-pointer"
    >
      <option value="">— Select —</option>
      {SHIP_TEMP_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
      {isLegacy && (
        <option value={value}>{value} (legacy)</option>
      )}
    </select>
  );
}

/**
 * CategoryPicker — dropdown of existing category names with a sentinel
 * "+ Add new category…" option that swaps the select for a text input
 * so admins can add a new category only when they explicitly opt in,
 * keeping the existing taxonomy tight by default.
 */
function CategoryPicker({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: string[];
  onChange: (next: string) => void;
}) {
  // If the current value is a category that doesn't exist in the list
  // (e.g. a legacy free-text value on an older test), treat it as
  // "adding new" so it remains editable and doesn't get dropped.
  const isExisting = value === "" || categories.includes(value);
  const [adding, setAdding] = useState(!isExisting && value !== "");

  if (adding) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mf-input"
          placeholder="Enter new category name"
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setAdding(false);
            onChange("");
          }}
          className="text-xs font-semibold whitespace-nowrap px-3 py-2 rounded-lg border"
          style={{
            color: "#e8d5a3",
            borderColor: "#2d6b35",
            backgroundColor: "transparent",
          }}
        >
          Use existing instead
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "__NEW__") {
          setAdding(true);
          onChange("");
          return;
        }
        onChange(next);
      }}
      className="mf-input cursor-pointer"
    >
      <option value="" disabled>
        Select a category…
      </option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__NEW__">+ Add new category…</option>
    </select>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
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
      {helper && (
        <p
          className="mt-1 text-xs"
          style={{ color: "#6ab04c" }}
        >
          {helper}
        </p>
      )}
    </div>
  );
}
