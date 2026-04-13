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
} from "lucide-react";
import { formatCurrency, slugify } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
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
  specimen_type: string;
  ship_temp: string;
  stability_notes: string;
  turnaround_display: string;
  turnaround_min_days: string;
  turnaround_max_days: string;
  lab_id: string;
};

const EMPTY_FORM: EditableFields = {
  name: "",
  description: "",
  category: "",
  price_cad: "",
  specimen_type: "",
  ship_temp: "",
  stability_notes: "",
  turnaround_display: "",
  turnaround_min_days: "",
  turnaround_max_days: "",
  lab_id: "",
};

export function TestsManager({ initialTests, labs }: TestsManagerProps) {
  const [tests, setTests] = useState<AdminTestRow[]>(initialTests);
  const [searchQuery, setSearchQuery] = useState("");
  const [labFilter, setLabFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  const createTest = async (fields: EditableFields) => {
    const supabase = createClient();
    const slug = slugify(fields.name);
    const payload = {
      name: fields.name,
      slug,
      description: fields.description || null,
      category: fields.category || null,
      price_cad: fields.price_cad ? parseFloat(fields.price_cad) : null,
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
        stability_notes, active, featured, created_at, updated_at
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
                  "Lab",
                  "Category",
                  "Price",
                  "Stock",
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
                    colSpan={8}
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
                      isEditing={isEditing}
                      onEdit={() => setEditingId(test.id)}
                      onCancel={() => setEditingId(null)}
                      onToggle={toggleField}
                      onSave={(fields) => saveEdit(test.id, fields)}
                      onUpdateStock={updateStock}
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
    </>
  );
}

// ─── Row + inline edit ──────────────────────────────────────────────────

function TestRow({
  test,
  rowBg,
  labs,
  isEditing,
  onEdit,
  onCancel,
  onToggle,
  onSave,
  onUpdateStock,
}: {
  test: AdminTestRow;
  rowBg: string;
  labs: AdminLabRow[];
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onToggle: (test: AdminTestRow, field: "active" | "featured") => void;
  onSave: (fields: EditableFields) => Promise<void>;
  onUpdateStock: (testId: string, newQty: number) => Promise<void>;
}) {
  const initialFields: EditableFields = {
    name: test.name,
    description: test.description ?? "",
    category: test.category ?? "",
    price_cad: test.price_cad != null ? String(test.price_cad) : "",
    specimen_type: test.specimen_type ?? "",
    ship_temp: test.ship_temp ?? "",
    stability_notes: test.stability_notes ?? "",
    turnaround_display: test.turnaround_display ?? "",
    turnaround_min_days:
      test.turnaround_min_days != null ? String(test.turnaround_min_days) : "",
    turnaround_max_days:
      test.turnaround_max_days != null ? String(test.turnaround_max_days) : "",
    lab_id: test.lab_id,
  };

  return (
    <>
      <tr
        style={{
          backgroundColor: rowBg,
          borderTop: "1px solid #1a3d22",
        }}
      >
        <td className="px-5 py-4 font-medium" style={{ color: "#ffffff" }}>
          {test.name}
        </td>
        <td className="px-5 py-4" style={{ color: "#e8d5a3" }}>
          {test.lab.name}
        </td>
        <td className="px-5 py-4" style={{ color: "#e8d5a3" }}>
          {test.category ?? "—"}
        </td>
        <td
          className="px-5 py-4 font-semibold whitespace-nowrap"
          style={{ color: "#c4973a" }}
        >
          {test.price_cad != null ? formatCurrency(test.price_cad) : "—"}
        </td>
        <td className="px-5 py-4">
          <StockCell test={test} onUpdateStock={onUpdateStock} />
        </td>
        <td className="px-5 py-4">
          <ToggleSwitch
            on={test.active}
            onClick={() => onToggle(test, "active")}
            label="Active"
          />
        </td>
        <td className="px-5 py-4">
          <ToggleSwitch
            on={test.featured}
            onClick={() => onToggle(test, "featured")}
            label="Featured"
          />
        </td>
        <td className="px-5 py-4 text-right">
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
        </td>
      </tr>

      {isEditing && (
        <tr style={{ backgroundColor: rowBg }}>
          <td colSpan={8} className="p-0">
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
                initialFields={initialFields}
                onCancel={onCancel}
                onSubmit={onSave}
              />
            </div>
          </td>
        </tr>
      )}
    </>
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
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
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
        className="relative inline-block w-9 h-5 rounded-full transition-colors"
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
      <span className="text-xs" style={{ color: on ? "#8dc63f" : "#6ab04c" }}>
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}

// ─── Inline form (shared by create + edit) ──────────────────────────────

function InlineTestForm({
  mode,
  labs,
  initialFields,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  labs: AdminLabRow[];
  initialFields: EditableFields;
  onCancel: () => void;
  onSubmit: (fields: EditableFields) => Promise<void>;
}) {
  const [fields, setFields] = useState<EditableFields>(initialFields);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

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
        <Field label="Category">
          <input
            type="text"
            value={fields.category}
            onChange={(e) => update("category", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Price (CAD)">
          <input
            type="number"
            step="0.01"
            value={fields.price_cad}
            onChange={(e) => update("price_cad", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Specimen Type">
          <input
            type="text"
            value={fields.specimen_type}
            onChange={(e) => update("specimen_type", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Ship Temperature">
          <input
            type="text"
            value={fields.ship_temp}
            onChange={(e) => update("ship_temp", e.target.value)}
            className="mf-input"
            placeholder="e.g. Frozen"
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
    </form>
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
