"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  Mail,
  FlaskConical,
  RefreshCw,
  Trash2,
  Search,
  X,
  ChevronDown,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { PendingOrder } from "@/app/(admin)/admin/results/page";

interface AdminResultsManagerProps {
  orders: PendingOrder[];
}

// ─── Shared filter / sort types ─────────────────────────────────────────

type StatusFilter = "awaiting" | "partial" | null;
type SortBy = "oldest_pending" | "newest" | "name_az";

interface DerivedStatus {
  key: "awaiting" | "partial" | "final";
  label: "Awaiting upload" | "Partial uploaded" | "Final uploaded";
  /** Hex pill color for backgroundColor + border + text wash. */
  color: string;
}

function deriveStatus(order: PendingOrder): DerivedStatus {
  if (!order.existingResult) {
    return {
      key: "awaiting",
      label: "Awaiting upload",
      color: "#c4973a",
    };
  }
  if (order.existingResult.result_status === "partial") {
    return {
      key: "partial",
      label: "Partial uploaded",
      color: "#93c5fd",
    };
  }
  return {
    key: "final",
    label: "Final uploaded",
    color: "#8dc63f",
  };
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// ─── Top-level manager ─────────────────────────────────────────────────

export function AdminResultsManager({ orders }: AdminResultsManagerProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("awaiting");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("oldest_pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce the search query so 250ms of typing doesn't re-render
  // the list every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const resetFilters = () => {
    setSearchInput("");
    setStatusFilter("awaiting");
    setHideCompleted(true);
    setSortBy("oldest_pending");
  };

  const visibleOrders = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const filtered = orders.filter((o) => {
      const status = deriveStatus(o);
      if (statusFilter === "awaiting" && status.key !== "awaiting") return false;
      if (statusFilter === "partial" && status.key !== "partial") return false;
      if (hideCompleted && status.key === "final") return false;
      if (q !== "") {
        const hay =
          (o.patientName + " " + o.patientEmail + " " + o.orderId + " " + o.orderIdShort).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "oldest_pending":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "name_az":
          return a.patientName.localeCompare(b.patientName);
      }
    });
    return sorted;
  }, [orders, debouncedSearch, statusFilter, hideCompleted, sortBy]);

  const totalCount = orders.length;
  const visibleCount = visibleOrders.length;
  const showTotalSubtitle = visibleCount !== totalCount;

  return (
    <>
      {/* ── Counter ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div
          className="flex items-center gap-3 rounded-xl border px-5 py-3"
          style={{
            backgroundColor: "#1a3d22",
            borderColor: visibleCount > 0 ? "#c4973a" : "#2d6b35",
          }}
        >
          <Upload
            className="w-5 h-5"
            style={{ color: visibleCount > 0 ? "#c4973a" : "#8dc63f" }}
          />
          <div>
            <p
              className="text-xl font-semibold"
              style={{ color: visibleCount > 0 ? "#c4973a" : "#ffffff" }}
            >
              {visibleCount}
            </p>
            <p className="text-xs" style={{ color: "#e8d5a3" }}>
              orders pending upload
            </p>
            {showTotalSubtitle && (
              <p
                className="text-[11px] italic mt-0.5"
                style={{ color: "#6ab04c" }}
              >
                {totalCount} total orders in queue
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Search + filter chips + sort ──────────────────────── */}
      <div className="space-y-3 mb-5">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "#6ab04c" }}
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by client name, email, or order ID..."
            className="mf-input pl-10 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
              style={{ color: "#6ab04c" }}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label="Awaiting upload"
            active={statusFilter === "awaiting"}
            onClick={() =>
              setStatusFilter((prev) => (prev === "awaiting" ? null : "awaiting"))
            }
          />
          <FilterChip
            label="Partial uploaded"
            active={statusFilter === "partial"}
            onClick={() =>
              setStatusFilter((prev) => (prev === "partial" ? null : "partial"))
            }
          />
          <FilterChip
            label="Hide completed"
            active={hideCompleted}
            onClick={() => setHideCompleted((v) => !v)}
            variant="toggle"
          />
          <div className="flex-1" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="mf-input cursor-pointer w-auto sm:max-w-[220px]"
          >
            <option value="oldest_pending">Oldest pending first</option>
            <option value="newest">Newest first</option>
            <option value="name_az">Client name A-Z</option>
          </select>
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────── */}
      {visibleOrders.length === 0 ? (
        <div
          className="rounded-xl border px-6 py-12 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          {totalCount === 0 ? (
            <>
              <CheckCircle
                className="w-10 h-10 mx-auto mb-3"
                style={{ color: "#8dc63f" }}
              />
              <p style={{ color: "#e8d5a3" }}>
                No Mayo Clinic orders requiring upload.
              </p>
            </>
          ) : (
            <>
              <p className="mb-4" style={{ color: "#e8d5a3" }}>
                No orders match the current filters.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold border"
                style={{
                  color: "#c4973a",
                  borderColor: "#c4973a",
                  backgroundColor: "transparent",
                }}
              >
                Reset filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleOrders.map((order) => (
            <OrderUploadCard
              key={order.orderId}
              order={order}
              expanded={expandedId === order.orderId}
              onToggleExpand={() =>
                setExpandedId((prev) =>
                  prev === order.orderId ? null : order.orderId,
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── Filter chip ────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
  variant = "exclusive",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: "exclusive" | "toggle";
}) {
  void variant;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
      style={{
        backgroundColor: active ? "#c4973a" : "transparent",
        borderColor: active ? "#c4973a" : "#2d6b35",
        color: active ? "#0a1a0d" : "#e8d5a3",
      }}
    >
      {label}
    </button>
  );
}

// ─── Per-order card (collapsed → expanded) ─────────────────────────────

function OrderUploadCard({
  order,
  expanded,
  onToggleExpand,
}: {
  order: PendingOrder;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [result, setResult] = useState(order.existingResult);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(!result);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resultStatus, setResultStatus] = useState<"partial" | "final">(
    "final"
  );
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const status = useMemo(
    () =>
      deriveStatus({
        ...order,
        existingResult: result, // reflect post-upload changes in the pill
      }),
    [order, result],
  );
  const pendingDays = useMemo(() => daysSince(order.createdAt), [order.createdAt]);
  const pendingColor = pendingDays > 7 ? "#c4973a" : "#6ab04c";

  const skuList = useMemo(() => {
    const skus = order.mayoTests
      .map((t) => t.sku)
      .filter((s): s is string => !!s);
    if (skus.length === 0) return null;
    if (skus.length <= 4) return skus.join(", ");
    return `${skus.slice(0, 4).join(", ")} +${skus.length - 4} more`;
  }, [order.mayoTests]);

  const handleFile = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      setError("Only PDF files are accepted.");
      return;
    }
    setSelectedFile(file);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("order_id", order.orderId);
    formData.append("result_status", resultStatus);
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/results/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }

      const data = await res.json();
      setResult({
        id: data.result_id,
        storage_path: "",
        file_name: selectedFile.name,
        result_status: resultStatus,
        uploaded_at: new Date().toISOString(),
        lab_reference_number: null,
      });
      setJustUploaded(true);
      setShowUploadZone(false);
      setSelectedFile(null);
      setTimeout(() => setJustUploaded(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!result) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/results/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: result.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Delete failed");
      }

      setResult(null);
      setConfirmDelete(false);
      setShowUploadZone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const hasResult = !!result;
  const isPartial = result?.result_status === "partial";

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      {/* ── Always-visible collapsed summary row ─────────────── */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="w-full text-left px-4 sm:px-5 py-3 transition-colors hover:bg-[#1f4a28]"
        style={{ backgroundColor: "#0f2614" }}
      >
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          {/* Left: order id + name + email */}
          <div className="min-w-0 flex-1 sm:flex-[2]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs" style={{ color: "#6ab04c" }}>
                #{order.orderIdShort}
              </span>
              <span
                className="text-sm font-semibold truncate"
                style={{ color: "#ffffff" }}
              >
                {order.patientName}
              </span>
            </div>
            {order.patientEmail !== "—" && (
              <p
                className="flex items-center gap-1 text-xs mt-0.5 truncate"
                style={{ color: "#e8d5a3" }}
              >
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{order.patientEmail}</span>
              </p>
            )}
          </div>

          {/* Middle: date + tests + SKUs */}
          <div className="min-w-0 flex-1 sm:flex-[2]">
            <p className="text-xs" style={{ color: "#6ab04c" }}>
              Placed {formatDate(order.createdAt)} · {order.mayoTests.length}{" "}
              Mayo {order.mayoTests.length === 1 ? "test" : "tests"}
            </p>
            {skuList && (
              <p
                className="text-xs font-mono mt-0.5 truncate"
                style={{ color: "#e8d5a3" }}
                title={order.mayoTests
                  .map((t) => t.sku)
                  .filter(Boolean)
                  .join(", ")}
              >
                {skuList}
              </p>
            )}
          </div>

          {/* Right: status pill + pending days + chevron */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border"
              style={{
                backgroundColor: `${status.color}1f`,
                borderColor: status.color,
                color: status.color,
              }}
            >
              {status.label}
            </span>
            <span
              className="text-xs whitespace-nowrap"
              style={{ color: pendingColor }}
            >
              Pending {pendingDays}d
            </span>
            <ChevronDown
              className="w-4 h-4 transition-transform"
              style={{
                color: "#c4973a",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </div>
        </div>
      </button>

      {/* ── Expanded body — kept in DOM with display:none so upload
          state survives collapse → reopen ─────────────────────── */}
      <div
        className="px-5 sm:px-6 py-4"
        style={{ display: expanded ? undefined : "none" }}
      >
        {/* Mayo tests */}
        <p
          className="text-xs uppercase tracking-wider mb-2 font-semibold"
          style={{ color: "#6ab04c" }}
        >
          Mayo Clinic Tests
        </p>
        <ul className="space-y-1.5 mb-4">
          {order.mayoTests.map((t, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-sm"
              style={{ color: "#e8d5a3" }}
            >
              <FlaskConical
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "#8dc63f" }}
              />
              <span style={{ color: "#ffffff" }}>
                {t.name}
                {t.sku && (
                  <span
                    className="ml-1.5 text-xs font-mono"
                    style={{ color: "#6ab04c" }}
                  >
                    ({t.sku})
                  </span>
                )}
              </span>
              {t.specimenType && (
                <span className="text-xs" style={{ color: "#6ab04c" }}>
                  · {t.specimenType}
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* Result on file indicator */}
        {hasResult && !showUploadZone && !confirmDelete && (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border p-4 mb-4 flex-wrap"
            style={{
              backgroundColor: "#0f2614",
              borderColor: isPartial ? "#c4973a" : "#8dc63f",
            }}
          >
            <div className="flex items-center gap-2.5">
              {isPartial ? (
                <Clock className="w-5 h-5 shrink-0" style={{ color: "#c4973a" }} />
              ) : (
                <CheckCircle className="w-5 h-5 shrink-0" style={{ color: "#8dc63f" }} />
              )}
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: isPartial ? "#c4973a" : "#8dc63f" }}
                >
                  {isPartial ? "Partial results on file" : "Final results on file"}
                </p>
                <p className="text-xs" style={{ color: "#6ab04c" }}>
                  Uploaded {formatDate(result!.uploaded_at)}
                  {result!.file_name && <> · {result!.file_name}</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowUploadZone(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shrink-0"
                style={{
                  color: "#e8d5a3",
                  borderColor: "#2d6b35",
                  backgroundColor: "transparent",
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Replace PDF
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shrink-0"
                style={{
                  color: "#e05252",
                  borderColor: "#e05252",
                  backgroundColor: "transparent",
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div
            className="rounded-lg border p-4 mb-4"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.08)",
              borderColor: "#e05252",
            }}
          >
            <p className="text-sm mb-3" style={{ color: "#e05252" }}>
              Are you sure you want to delete this result? The patient will
              lose access to this PDF.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: "#e05252",
                  color: "#ffffff",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border"
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

        {/* Just-uploaded confirmation */}
        {justUploaded && (
          <div
            className="flex items-center gap-3 rounded-lg border p-4 mb-4"
            style={{
              backgroundColor: "rgba(141, 198, 63, 0.12)",
              borderColor: "#8dc63f",
            }}
          >
            <CheckCircle className="w-5 h-5 shrink-0" style={{ color: "#8dc63f" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#ffffff" }}>
                Results uploaded — patient notified by email and SMS
              </p>
              <p className="text-xs" style={{ color: "#8dc63f" }}>
                {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Upload zone */}
        {showUploadZone && (
          <div className="space-y-3">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors"
              style={{
                borderColor: dragging ? "#c4973a" : selectedFile ? "#8dc63f" : "#2d6b35",
                backgroundColor: dragging ? "#1f4a28" : selectedFile ? "#1a3d22" : "#0f2614",
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5" style={{ color: "#8dc63f" }} />
                  <span className="text-sm font-medium truncate max-w-xs" style={{ color: "#ffffff" }}>
                    {selectedFile.name}
                  </span>
                  <span className="text-xs" style={{ color: "#6ab04c" }}>
                    ({(selectedFile.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "#6ab04c" }} />
                  <p className="text-sm" style={{ color: "#e8d5a3" }}>
                    <span className="font-semibold" style={{ color: "#c4973a" }}>Drop PDF here</span> or click to upload
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
                    One PDF for all Mayo tests in this order
                  </p>
                </div>
              )}
            </div>

            {/* Status toggle */}
            <div className="flex items-center gap-4">
              <p className="text-xs font-medium" style={{ color: "#e8d5a3" }}>Status:</p>
              {(["final", "partial"] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`status-${order.orderId}`}
                    value={s}
                    checked={resultStatus === s}
                    onChange={() => setResultStatus(s)}
                    style={{ accentColor: "#c4973a" }}
                  />
                  <span
                    className="text-xs font-medium capitalize"
                    style={{
                      color: resultStatus === s
                        ? s === "partial" ? "#c4973a" : "#8dc63f"
                        : "#6ab04c",
                    }}
                  >
                    {s === "final" ? "Final Results" : "Partial Results"}
                  </span>
                </label>
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "#e05252" }}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {selectedFile && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="mf-btn-primary w-full py-2.5"
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading & notifying patient…</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload and Notify</>
                )}
              </button>
            )}

            {hasResult && (
              <button
                type="button"
                onClick={() => { setShowUploadZone(false); setSelectedFile(null); setError(null); }}
                className="w-full text-center text-xs font-medium py-1"
                style={{ color: "#6ab04c" }}
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
