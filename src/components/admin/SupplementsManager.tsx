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
  Trash2,
  AlertTriangle,
  ImageIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Supplement } from "@/types/supplements";

interface SupplementsManagerProps {
  initialSupplements: Supplement[];
}

type EditableFields = {
  sku: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  price_cad: string;
  cost_cad: string;
  image_url: string;
  track_inventory: boolean;
  stock_qty: string;
  low_stock_threshold: string;
};

const EMPTY_FORM: EditableFields = {
  sku: "",
  name: "",
  description: "",
  brand: "",
  category: "",
  price_cad: "",
  cost_cad: "",
  image_url: "",
  track_inventory: false,
  stock_qty: "0",
  low_stock_threshold: "5",
};

export function SupplementsManager({
  initialSupplements,
}: SupplementsManagerProps) {
  const [supplements, setSupplements] =
    useState<Supplement[]>(initialSupplements);
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const brands = useMemo(
    () =>
      Array.from(
        new Set(
          supplements.map((s) => s.brand).filter((b): b is string => !!b),
        ),
      ).sort(),
    [supplements],
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          supplements
            .map((s) => s.category)
            .filter((c): c is string => !!c),
        ),
      ).sort(),
    [supplements],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return supplements.filter((s) => {
      if (q) {
        const matches =
          s.name.toLowerCase().includes(q) ||
          s.sku.toLowerCase().includes(q) ||
          (!!s.brand && s.brand.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (brandFilter !== "all" && s.brand !== brandFilter) return false;
      if (categoryFilter !== "all" && s.category !== categoryFilter)
        return false;
      if (activeFilter === "active" && !s.active) return false;
      if (activeFilter === "inactive" && s.active) return false;
      return true;
    });
  }, [supplements, searchQuery, brandFilter, categoryFilter, activeFilter]);

  const toggleField = async (
    supp: Supplement,
    field: "active" | "featured",
  ) => {
    const newValue = !supp[field];
    const res = await fetch(`/api/admin/supplements/${supp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue }),
    });
    if (!res.ok) {
      alert("Failed to update");
      return;
    }
    setSupplements((prev) =>
      prev.map((s) => (s.id === supp.id ? { ...s, [field]: newValue } : s)),
    );
  };

  const saveEdit = async (suppId: string, fields: EditableFields) => {
    const payload = buildPayload(fields);
    const res = await fetch(`/api/admin/supplements/${suppId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save");
    setSupplements((prev) =>
      prev.map((s) => (s.id === suppId ? (data as Supplement) : s)),
    );
    setEditingId(null);
  };

  const createSupplement = async (fields: EditableFields) => {
    const payload = buildPayload(fields);
    const res = await fetch("/api/admin/supplements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to create");
    setSupplements((prev) => [data as Supplement, ...prev]);
    setCreating(false);
  };

  const deactivateSupplement = async (suppId: string) => {
    const res = await fetch(`/api/admin/supplements/${suppId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Failed to deactivate");
    }
    setSupplements((prev) =>
      prev.map((s) => (s.id === suppId ? { ...s, active: false } : s)),
    );
    setEditingId(null);
  };

  const deleteSupplement = async (
    suppId: string,
  ): Promise<{ action: "deleted" | "deactivated"; message?: string }> => {
    const res = await fetch(`/api/admin/supplements/${suppId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Failed to delete");
    if (data.action === "deleted") {
      setSupplements((prev) => prev.filter((s) => s.id !== suppId));
    } else {
      setSupplements((prev) =>
        prev.map((s) => (s.id === suppId ? { ...s, active: false } : s)),
      );
    }
    setEditingId(null);
    return { action: data.action, message: data.message };
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
            placeholder="Search by name, SKU, or brand…"
            className="mf-input pl-10"
          />
        </div>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="mf-input sm:max-w-[200px] cursor-pointer"
        >
          <option value="all">All Brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
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
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="mf-input sm:max-w-[140px] cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <Plus className="w-4 h-4" />
          {creating ? "Cancel New" : "New Supplement"}
        </button>
      </div>

      {/* New supplement inline form */}
      {creating && (
        <div className="mb-4">
          <InlineSupplementForm
            mode="create"
            brands={brands}
            categories={categories}
            initialFields={EMPTY_FORM}
            onCancel={() => setCreating(false)}
            onSubmit={createSupplement}
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
                  "",
                  "Name",
                  "SKU",
                  "Brand",
                  "Category",
                  "Price",
                  "Cost",
                  "Margin",
                  "Stock",
                  "Active",
                  "Featured",
                  "",
                ].map((h, i) => (
                  <th
                    key={i}
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
                    colSpan={12}
                    className="px-6 py-16 text-center"
                    style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
                  >
                    {supplements.length === 0
                      ? "No supplements yet"
                      : "No supplements match your filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((supp, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const isEditing = editingId === supp.id;

                  return (
                    <SupplementRow
                      key={supp.id}
                      supp={supp}
                      rowBg={rowBg}
                      brands={brands}
                      categories={categories}
                      isEditing={isEditing}
                      onEdit={() => setEditingId(supp.id)}
                      onCancel={() => setEditingId(null)}
                      onToggle={toggleField}
                      onSave={(fields) => saveEdit(supp.id, fields)}
                      onDeactivate={() => deactivateSupplement(supp.id)}
                      onDelete={() => deleteSupplement(supp.id)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-right" style={{ color: "#6ab04c" }}>
        Showing {filtered.length} of {supplements.length} supplements
      </p>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPayload(fields: EditableFields) {
  return {
    sku: fields.sku.trim(),
    name: fields.name.trim(),
    description: fields.description || null,
    brand: fields.brand || null,
    category: fields.category || null,
    price_cad: fields.price_cad ? parseFloat(fields.price_cad) : 0,
    cost_cad: fields.cost_cad ? parseFloat(fields.cost_cad) : null,
    image_url: fields.image_url || null,
    track_inventory: fields.track_inventory,
    stock_qty: fields.track_inventory
      ? parseInt(fields.stock_qty, 10) || 0
      : 0,
    low_stock_threshold: fields.track_inventory
      ? parseInt(fields.low_stock_threshold, 10) || 5
      : 5,
  };
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function SupplementRow({
  supp,
  rowBg,
  brands,
  categories,
  isEditing,
  onEdit,
  onCancel,
  onToggle,
  onSave,
  onDeactivate,
  onDelete,
}: {
  supp: Supplement;
  rowBg: string;
  brands: string[];
  categories: string[];
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onToggle: (supp: Supplement, field: "active" | "featured") => void;
  onSave: (fields: EditableFields) => Promise<void>;
  onDeactivate: () => Promise<void>;
  onDelete: () => Promise<{
    action: "deleted" | "deactivated";
    message?: string;
  }>;
}) {
  const initialFields: EditableFields = {
    sku: supp.sku,
    name: supp.name,
    description: supp.description ?? "",
    brand: supp.brand ?? "",
    category: supp.category ?? "",
    price_cad: String(supp.price_cad),
    cost_cad: supp.cost_cad != null ? String(supp.cost_cad) : "",
    image_url: supp.image_url ?? "",
    track_inventory: supp.track_inventory,
    stock_qty: String(supp.stock_qty),
    low_stock_threshold: String(supp.low_stock_threshold),
  };

  const margin =
    supp.cost_cad != null ? supp.price_cad - supp.cost_cad : null;
  const isLowStock =
    supp.track_inventory && supp.stock_qty <= supp.low_stock_threshold;

  return (
    <>
      <tr
        id={`supp-${supp.id}`}
        style={{ backgroundColor: rowBg, borderTop: "1px solid #1a3d22" }}
      >
        {/* Thumbnail */}
        <td className="px-4 py-3 w-12">
          {supp.image_url ? (
            <img
              src={supp.image_url}
              alt=""
              className="w-10 h-10 rounded-lg object-cover"
              style={{ border: "1px solid #2d6b35" }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#0f2614", border: "1px solid #2d6b35" }}
            >
              <ImageIcon className="w-4 h-4" style={{ color: "#2d6b35" }} />
            </div>
          )}
        </td>
        <td className="px-4 py-3 font-medium" style={{ color: "#ffffff" }}>
          {supp.name}
        </td>
        <td
          className="px-4 py-3 whitespace-nowrap font-mono text-xs"
          style={{ color: "#e8d5a3" }}
        >
          {supp.sku}
        </td>
        <td className="px-4 py-3" style={{ color: "#e8d5a3" }}>
          {supp.brand ?? "—"}
        </td>
        <td className="px-4 py-3" style={{ color: "#e8d5a3" }}>
          {supp.category ?? "—"}
        </td>
        <td
          className="px-4 py-3 font-semibold whitespace-nowrap"
          style={{ color: "#c4973a" }}
        >
          {formatCurrency(supp.price_cad)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#e8d5a3" }}>
          {supp.cost_cad != null ? formatCurrency(supp.cost_cad) : "—"}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {margin != null ? (
            <span style={{ color: margin >= 0 ? "#8dc63f" : "#e05252" }}>
              ${margin.toFixed(2)}
            </span>
          ) : (
            <span style={{ color: "#6ab04c" }}>—</span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {supp.track_inventory ? (
            <div className="flex items-center gap-1.5">
              <span style={{ color: "#e8d5a3" }}>{supp.stock_qty}</span>
              {isLowStock && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                  style={{ backgroundColor: "#e05252", color: "#fff" }}
                >
                  Low
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs" style={{ color: "#6ab04c" }}>
              —
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <ToggleSwitch
            on={supp.active}
            onClick={() => onToggle(supp, "active")}
          />
        </td>
        <td className="px-4 py-3">
          <ToggleSwitch
            on={supp.featured}
            onClick={() => onToggle(supp, "featured")}
          />
        </td>
        <td className="px-4 py-3 text-right">
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
          <td colSpan={12} className="p-0">
            <div
              className="px-6 py-5 border-t"
              style={{ borderColor: "#2d6b35", backgroundColor: "#0f2614" }}
            >
              <InlineSupplementForm
                mode="edit"
                brands={brands}
                categories={categories}
                initialFields={initialFields}
                onCancel={onCancel}
                onSubmit={onSave}
                onDeactivate={onDeactivate}
                onDelete={onDelete}
                suppName={supp.name}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function ToggleSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="relative w-10 h-5 rounded-full transition-colors"
      style={{ backgroundColor: on ? "#c4973a" : "#2d6b35" }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
        style={{
          backgroundColor: "#fff",
          transform: on ? "translateX(22px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

// ─── Inline form ──────────────────────────────────────────────────────────────

function InlineSupplementForm({
  mode,
  brands,
  categories,
  initialFields,
  onCancel,
  onSubmit,
  onDeactivate,
  onDelete,
  suppName,
}: {
  mode: "create" | "edit";
  brands: string[];
  categories: string[];
  initialFields: EditableFields;
  onCancel: () => void;
  onSubmit: (fields: EditableFields) => Promise<void>;
  onDeactivate?: () => Promise<void>;
  onDelete?: () => Promise<{
    action: "deleted" | "deactivated";
    message?: string;
  }>;
  suppName?: string;
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
    value: EditableFields[K],
  ) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const marginLive = (() => {
    const p = parseFloat(fields.price_cad);
    const c = parseFloat(fields.cost_cad);
    if (isNaN(p) || isNaN(c)) return null;
    return p - c;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fields.sku.trim()) {
      setError("SKU is required");
      return;
    }
    if (!fields.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!fields.price_cad || isNaN(parseFloat(fields.price_cad))) {
      setError("Price is required");
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

  const labelStyle = { color: "#e8d5a3" };

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
        {mode === "create" ? "New Supplement" : "Edit Supplement"}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="SKU" required>
          <input
            type="text"
            value={fields.sku}
            onChange={(e) => update("sku", e.target.value)}
            className="mf-input font-mono"
            placeholder="e.g. SUPP-MAG-001"
          />
        </Field>
        <Field label="Name" required>
          <input
            type="text"
            value={fields.name}
            onChange={(e) => update("name", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Brand" helper="Type or pick from existing brands">
          <input
            type="text"
            list="brand-list"
            value={fields.brand}
            onChange={(e) => update("brand", e.target.value)}
            className="mf-input"
            placeholder="e.g. MitoLife"
          />
          <datalist id="brand-list">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label="Category" helper="Type or pick from existing categories">
          <input
            type="text"
            list="category-list"
            value={fields.category}
            onChange={(e) => update("category", e.target.value)}
            className="mf-input"
            placeholder="e.g. Minerals"
          />
          <datalist id="category-list">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Price CAD" required>
          <input
            type="number"
            step="0.01"
            min="0"
            value={fields.price_cad}
            onChange={(e) => update("price_cad", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Cost CAD">
          <input
            type="number"
            step="0.01"
            min="0"
            value={fields.cost_cad}
            onChange={(e) => update("cost_cad", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field label="Margin (calculated)">
          <div
            className="mf-input flex items-center"
            style={{
              backgroundColor: "#0a1a0d",
              cursor: "default",
              color:
                marginLive == null
                  ? "#6ab04c"
                  : marginLive >= 0
                    ? "#8dc63f"
                    : "#e05252",
            }}
          >
            {marginLive != null ? `$${marginLive.toFixed(2)}` : "—"}
          </div>
        </Field>
        <Field label="Image URL">
          <input
            type="text"
            value={fields.image_url}
            onChange={(e) => update("image_url", e.target.value)}
            className="mf-input"
            placeholder="https://..."
          />
        </Field>
      </div>

      {/* Image preview */}
      {fields.image_url && (
        <div>
          <p
            className="text-xs font-medium mb-1.5"
            style={labelStyle}
          >
            Preview
          </p>
          <img
            src={fields.image_url}
            alt="Preview"
            className="w-[150px] h-[150px] rounded-lg object-cover"
            style={{ border: "1px solid #2d6b35" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <Field label="Description">
        <textarea
          value={fields.description}
          onChange={(e) => update("description", e.target.value)}
          className="mf-input"
          rows={3}
        />
      </Field>

      {/* Inventory toggles */}
      <div
        className="rounded-lg border p-4 space-y-3"
        style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
      >
        <label className="flex items-center gap-3 cursor-pointer">
          <ToggleSwitch
            on={fields.track_inventory}
            onClick={() => update("track_inventory", !fields.track_inventory)}
          />
          <span className="text-sm font-medium" style={labelStyle}>
            Track inventory
          </span>
        </label>
        {fields.track_inventory && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock Qty">
              <input
                type="number"
                min="0"
                value={fields.stock_qty}
                onChange={(e) => update("stock_qty", e.target.value)}
                className="mf-input"
              />
            </Field>
            <Field label="Low Stock Threshold">
              <input
                type="number"
                min="0"
                value={fields.low_stock_threshold}
                onChange={(e) =>
                  update("low_stock_threshold", e.target.value)
                }
                className="mf-input"
              />
            </Field>
          </div>
        )}
      </div>

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
          {saving
            ? "Saving…"
            : savedFlash
              ? "Saved"
              : mode === "create"
                ? "Create"
                : "Save Changes"}
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

      {/* Danger zone */}
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
                Remove this supplement. If it has been ordered, it will be
                deactivated instead.
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
                Delete…
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: "#ffffff" }}>
                Are you sure you want to delete{" "}
                <strong style={{ color: "#e05252" }}>
                  {suppName ?? "this supplement"}
                </strong>
                ? This cannot be undone.
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
                          : "Failed to deactivate",
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
                <button
                  type="button"
                  disabled={deleteBusy !== null}
                  onClick={async () => {
                    setDeleteError(null);
                    setDeleteBusy("delete");
                    try {
                      const result = await onDelete();
                      if (
                        result.action === "deactivated" &&
                        result.message
                      ) {
                        alert(result.message);
                      }
                    } catch (err) {
                      setDeleteError(
                        err instanceof Error
                          ? err.message
                          : "Failed to delete",
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

// ─── Field ────────────────────────────────────────────────────────────────────

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
        <p className="mt-1 text-xs" style={{ color: "#6ab04c" }}>
          {helper}
        </p>
      )}
    </div>
  );
}
