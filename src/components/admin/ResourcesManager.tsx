"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Edit2,
  X,
  Loader2,
  AlertCircle,
  Mail,
  Check,
  Trash2,
  AlertTriangle,
  FileText,
  Upload,
  ImageIcon,
  Download,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ImageUploadField } from "./ImageUploadField";
import { resolveResourceCoverUrl } from "@/lib/storage/imageUrl";
import { signedUploadToStorage } from "@/lib/storage/upload";
import type { Resource } from "@/types/resources";

interface ResourcesManagerProps {
  initialResources: Resource[];
}

type EditableFields = {
  title: string;
  description: string;
  price_cad: string;
  file_path: string;
  file_size_bytes: number | null;
  file_type: string;
  page_count: number | null;
  cover_image_url: string;
};

const EMPTY_FORM: EditableFields = {
  title: "",
  description: "",
  price_cad: "0",
  file_path: "",
  file_size_bytes: null,
  file_type: "application/pdf",
  page_count: null,
  cover_image_url: "",
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResourcesManager({
  initialResources,
}: ResourcesManagerProps) {
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [searchQuery, setSearchQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return resources.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (priceFilter === "free" && r.price_cad > 0) return false;
      if (priceFilter === "paid" && r.price_cad === 0) return false;
      if (activeFilter === "active" && !r.active) return false;
      if (activeFilter === "inactive" && r.active) return false;
      return true;
    });
  }, [resources, searchQuery, priceFilter, activeFilter]);

  const toggleField = async (
    res: Resource,
    field: "active" | "featured",
  ) => {
    const newValue = !res[field];
    const resp = await fetch(`/api/admin/resources/${res.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue }),
    });
    if (!resp.ok) {
      alert("Failed to update");
      return;
    }
    setResources((prev) =>
      prev.map((r) => (r.id === res.id ? { ...r, [field]: newValue } : r)),
    );
  };

  const saveEdit = async (resId: string, fields: EditableFields) => {
    const payload = buildPayload(fields);
    const resp = await fetch(`/api/admin/resources/${resId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Failed to save");
    setResources((prev) =>
      prev.map((r) => (r.id === resId ? (data as Resource) : r)),
    );
    setEditingId(null);
  };

  const createResource = async (fields: EditableFields) => {
    const payload = buildPayload(fields);
    const resp = await fetch("/api/admin/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Failed to create");
    setResources((prev) => [data as Resource, ...prev]);
    setCreating(false);
  };

  const deactivateResource = async (resId: string) => {
    const resp = await fetch(`/api/admin/resources/${resId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    if (!resp.ok) {
      const d = await resp.json().catch(() => ({}));
      throw new Error(d.error ?? "Failed to deactivate");
    }
    setResources((prev) =>
      prev.map((r) => (r.id === resId ? { ...r, active: false } : r)),
    );
    setEditingId(null);
  };

  const deleteResource = async (
    resId: string,
  ): Promise<{ action: "deleted" | "deactivated"; message?: string }> => {
    const resp = await fetch(`/api/admin/resources/${resId}`, {
      method: "DELETE",
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error ?? "Failed to delete");
    if (data.action === "deleted") {
      setResources((prev) => prev.filter((r) => r.id !== resId));
    } else {
      setResources((prev) =>
        prev.map((r) => (r.id === resId ? { ...r, active: false } : r)),
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
            placeholder="Search by title…"
            className="mf-input pl-10"
          />
        </div>
        <select
          value={priceFilter}
          onChange={(e) => setPriceFilter(e.target.value)}
          className="mf-input sm:max-w-[160px] cursor-pointer"
        >
          <option value="all">All Prices</option>
          <option value="free">Free Only</option>
          <option value="paid">Paid Only</option>
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
          {creating ? "Cancel New" : "New Resource"}
        </button>
      </div>

      {creating && (
        <div className="mb-4">
          <InlineResourceForm
            mode="create"
            initialFields={EMPTY_FORM}
            onCancel={() => setCreating(false)}
            onSubmit={createResource}
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
                  "Title",
                  "Price",
                  "File Size",
                  "Pages",
                  "Downloads",
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
                    colSpan={9}
                    className="px-6 py-16 text-center"
                    style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
                  >
                    {resources.length === 0
                      ? "No resources yet"
                      : "No resources match your filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((res, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const isEditing = editingId === res.id;
                  return (
                    <ResourceRow
                      key={res.id}
                      res={res}
                      rowBg={rowBg}
                      isEditing={isEditing}
                      onEdit={() => setEditingId(res.id)}
                      onCancel={() => setEditingId(null)}
                      onToggle={toggleField}
                      onSave={(fields) => saveEdit(res.id, fields)}
                      onDeactivate={() => deactivateResource(res.id)}
                      onDelete={() => deleteResource(res.id)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-right" style={{ color: "#6ab04c" }}>
        Showing {filtered.length} of {resources.length} resources
      </p>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPayload(fields: EditableFields) {
  return {
    title: fields.title.trim(),
    description: fields.description || null,
    price_cad: fields.price_cad ? parseFloat(fields.price_cad) : 0,
    file_path: fields.file_path,
    file_size_bytes: fields.file_size_bytes,
    file_type: fields.file_type,
    page_count: fields.page_count,
    cover_image_url: fields.cover_image_url || null,
  };
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ResourceRow({
  res,
  rowBg,
  isEditing,
  onEdit,
  onCancel,
  onToggle,
  onSave,
  onDeactivate,
  onDelete,
}: {
  res: Resource;
  rowBg: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onToggle: (r: Resource, field: "active" | "featured") => void;
  onSave: (fields: EditableFields) => Promise<void>;
  onDeactivate: () => Promise<void>;
  onDelete: () => Promise<{
    action: "deleted" | "deactivated";
    message?: string;
  }>;
}) {
  const initialFields: EditableFields = {
    title: res.title,
    description: res.description ?? "",
    price_cad: String(res.price_cad),
    file_path: res.file_path,
    file_size_bytes: res.file_size_bytes,
    file_type: res.file_type,
    page_count: res.page_count,
    cover_image_url: res.cover_image_url ?? "",
  };

  const isFree = res.price_cad === 0;

  return (
    <>
      <tr
        id={`res-${res.id}`}
        style={{ backgroundColor: rowBg, borderTop: "1px solid #1a3d22" }}
      >
        {/* Cover thumbnail */}
        <td className="px-4 py-3 w-12">
          {res.cover_image_url ? (
            <img
              src={resolveResourceCoverUrl(res.cover_image_url) ?? ""}
              alt=""
              className="w-10 h-10 rounded-lg object-cover"
              style={{ border: "1px solid #2d6b35" }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: "#0f2614",
                border: "1px solid #2d6b35",
              }}
            >
              <FileText className="w-4 h-4" style={{ color: "#2d6b35" }} />
            </div>
          )}
        </td>
        <td className="px-4 py-3 font-medium" style={{ color: "#ffffff" }}>
          {res.title}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {isFree ? (
            <span
              className="px-2 py-0.5 rounded text-xs font-bold uppercase"
              style={{ backgroundColor: "#8dc63f", color: "#0a1a0d" }}
            >
              Free
            </span>
          ) : (
            <span className="font-semibold" style={{ color: "#c4973a" }}>
              {formatCurrency(res.price_cad)}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-xs" style={{ color: "#e8d5a3" }}>
          {formatBytes(res.file_size_bytes)}
        </td>
        <td className="px-4 py-3 text-xs" style={{ color: "#e8d5a3" }}>
          {res.page_count ?? "—"}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" style={{ color: "#6ab04c" }} />
            <span style={{ color: "#e8d5a3" }}>{res.download_count}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <ToggleSwitch
            on={res.active}
            onClick={() => onToggle(res, "active")}
          />
        </td>
        <td className="px-4 py-3">
          <ToggleSwitch
            on={res.featured}
            onClick={() => onToggle(res, "featured")}
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
          <td colSpan={9} className="p-0">
            <div
              className="px-6 py-5 border-t"
              style={{ borderColor: "#2d6b35", backgroundColor: "#0f2614" }}
            >
              <InlineResourceForm
                mode="edit"
                initialFields={initialFields}
                onCancel={onCancel}
                onSubmit={onSave}
                onDeactivate={onDeactivate}
                onDelete={onDelete}
                resTitle={res.title}
                resourceId={res.id}
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

function InlineResourceForm({
  mode,
  initialFields,
  onCancel,
  onSubmit,
  onDeactivate,
  onDelete,
  resTitle,
  resourceId,
}: {
  mode: "create" | "edit";
  initialFields: EditableFields;
  onCancel: () => void;
  onSubmit: (fields: EditableFields) => Promise<void>;
  onDeactivate?: () => Promise<void>;
  onDelete?: () => Promise<{
    action: "deleted" | "deactivated";
    message?: string;
  }>;
  resTitle?: string;
  resourceId?: string;
}) {
  const [fields, setFields] = useState<EditableFields>(initialFields);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(
    initialFields.file_path ? initialFields.file_path.split("/").pop() ?? null : null,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState<
    null | "deactivate" | "delete"
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K],
  ) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Only PDF files are accepted");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File exceeds 50 MB limit");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const result = await signedUploadToStorage(
        file,
        "/api/admin/resources/upload",
        "application/pdf",
      );

      // Page count extraction client-side (best-effort)
      let pageCount: number | null = null;
      try {
        const { PDFDocument } = await import("pdf-lib");
        const buf = await file.arrayBuffer();
        const pdf = await PDFDocument.load(buf, {
          ignoreEncryption: true,
        });
        pageCount = pdf.getPageCount();
      } catch {
        // Non-fatal — pageCount stays null
      }

      setFields((prev) => ({
        ...prev,
        file_path: result.filePath,
        file_size_bytes: result.fileSize,
        file_type: "application/pdf",
        page_count: pageCount,
      }));
      setUploadFileName(result.fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fields.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!fields.file_path) {
      setError("A PDF file must be uploaded");
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
        {mode === "create" ? "New Resource" : "Edit Resource"}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Title" required>
          <input
            type="text"
            value={fields.title}
            onChange={(e) => update("title", e.target.value)}
            className="mf-input"
          />
        </Field>
        <Field
          label="Price (CAD)"
          helper="Set to 0 for free resources"
        >
          <input
            type="number"
            step="0.01"
            min="0"
            value={fields.price_cad}
            onChange={(e) => update("price_cad", e.target.value)}
            className="mf-input"
          />
        </Field>
      </div>

      {/* PDF upload */}
      <Field label="PDF File" required>
        <div className="space-y-2">
          {fields.file_path ? (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#2d6b35",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText
                  className="w-5 h-5 shrink-0"
                  style={{ color: "#c4973a" }}
                />
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "#ffffff" }}
                  >
                    {uploadFileName ?? fields.file_path}
                  </p>
                  <p className="text-xs" style={{ color: "#6ab04c" }}>
                    {formatBytes(fields.file_size_bytes)}
                    {fields.page_count != null &&
                      ` · ${fields.page_count} pages`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shrink-0"
                style={{
                  color: "#c4973a",
                  borderColor: "#2d6b35",
                  backgroundColor: "transparent",
                }}
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                Replace file
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors"
              style={{
                borderColor: uploading ? "#c4973a" : "#2d6b35",
                backgroundColor: "#0f2614",
                color: "#e8d5a3",
              }}
            >
              {uploading ? (
                <>
                  <Loader2
                    className="w-8 h-8 animate-spin"
                    style={{ color: "#c4973a" }}
                  />
                  <span className="text-sm">Uploading…</span>
                </>
              ) : (
                <>
                  <Upload
                    className="w-8 h-8"
                    style={{ color: "#2d6b35" }}
                  />
                  <span className="text-sm">
                    Click to upload a PDF (max 50 MB)
                  </span>
                </>
              )}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </Field>

      {/* Cover image */}
      <ImageUploadField
        label="Cover Image (optional)"
        value={fields.cover_image_url || null}
        bucket="resource-covers"
        onChange={(path) => update("cover_image_url", path ?? "")}
      />

      <Field label="Description">
        <textarea
          value={fields.description}
          onChange={(e) => update("description", e.target.value)}
          className="mf-input"
          rows={3}
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

      {/* Purchases list */}
      {mode === "edit" && resourceId && (
        <ResourcePurchases resourceId={resourceId} />
      )}

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
                Remove this resource. If it has been purchased, it will be
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
                  {resTitle ?? "this resource"}
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

// ─── Purchases list ───────────────────────────────────────────────────────────

interface Purchase {
  id: string;
  email: string;
  download_count: number;
  max_downloads: number;
  expires_at: string;
  created_at: string;
}

function ResourcePurchases({ resourceId }: { resourceId: string }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/resources/${resourceId}/purchases`);
      if (res.ok) {
        const data = await res.json();
        setPurchases(data as Purchase[]);
      }
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResend = async (purchaseId: string) => {
    setResending(purchaseId);
    try {
      const res = await fetch(
        `/api/admin/resources/purchases/${purchaseId}/resend`,
        { method: "POST" },
      );
      if (res.ok) {
        alert("Download email resent successfully.");
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to resend: ${data.error ?? "Unknown error"}`);
      }
    } finally {
      setResending(null);
    }
  };

  if (loading) {
    return (
      <div className="py-4 text-center">
        <Loader2
          className="w-5 h-5 animate-spin mx-auto"
          style={{ color: "#c4973a" }}
        />
      </div>
    );
  }

  if (purchases.length === 0) return null;

  return (
    <div
      className="mt-6 rounded-lg border p-4"
      style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
    >
      <h4
        className="text-sm font-semibold uppercase tracking-wider mb-3"
        style={{ color: "#c4973a" }}
      >
        Purchases ({purchases.length})
      </h4>
      <div className="space-y-2">
        {purchases.map((p) => {
          const isExpired = new Date(p.expires_at) < new Date();
          const isMaxed = p.download_count >= p.max_downloads;
          return (
            <div
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs rounded-lg border p-3"
              style={{
                backgroundColor: "#0a1a0d",
                borderColor: "#2d6b35",
              }}
            >
              <div className="min-w-0">
                <p className="font-medium" style={{ color: "#ffffff" }}>
                  {p.email}
                </p>
                <p style={{ color: "#6ab04c" }}>
                  {p.download_count}/{p.max_downloads} downloads · Expires{" "}
                  {new Date(p.expires_at).toLocaleDateString("en-CA", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {isExpired && (
                    <span
                      className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{ backgroundColor: "#e05252", color: "#fff" }}
                    >
                      Expired
                    </span>
                  )}
                  {isMaxed && !isExpired && (
                    <span
                      className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                    >
                      Max reached
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={resending === p.id}
                onClick={() => handleResend(p.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shrink-0"
                style={{
                  color: "#c4973a",
                  borderColor: "#2d6b35",
                  backgroundColor: "transparent",
                  opacity: resending === p.id ? 0.5 : 1,
                }}
              >
                {resending === p.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Mail className="w-3 h-3" />
                )}
                Resend email
              </button>
            </div>
          );
        })}
      </div>
    </div>
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
