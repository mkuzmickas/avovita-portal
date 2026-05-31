"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Mail,
  FlaskConical,
  RefreshCw,
  Trash2,
  Search,
  X,
  ChevronDown,
  Eye,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { PendingOrder, OrderResultRow } from "@/app/(admin)/admin/results/page";

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

/**
 * Per-order status derived from however many PDFs are attached. Any
 * 'final' wins; else any 'partial'; else nothing yet.
 */
function deriveStatus(results: OrderResultRow[]): DerivedStatus {
  if (results.length === 0) {
    return { key: "awaiting", label: "Awaiting upload", color: "#c4973a" };
  }
  if (results.some((r) => r.result_status === "final")) {
    return { key: "final", label: "Final uploaded", color: "#8dc63f" };
  }
  return { key: "partial", label: "Partial uploaded", color: "#93c5fd" };
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

const MAX_BATCH = 20;
const MAX_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Top-level manager ─────────────────────────────────────────────────

export function AdminResultsManager({ orders }: AdminResultsManagerProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("awaiting");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("oldest_pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const status = deriveStatus(o.results);
      if (statusFilter === "awaiting" && status.key !== "awaiting") return false;
      if (statusFilter === "partial" && status.key !== "partial") return false;
      if (hideCompleted && status.key === "final") return false;
      if (q !== "") {
        const hay =
          (o.patientName +
            " " +
            o.patientEmail +
            " " +
            o.orderId +
            " " +
            o.orderIdShort).toLowerCase();
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
              orders matching filters
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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

// ─── Per-order card (batch upload + uploaded list) ─────────────────────

type QueueItemStatus =
  | { state: "pending" }
  | { state: "uploading"; progress: number }
  | { state: "done" }
  | { state: "error"; message: string };

interface QueueItem {
  id: string; // local id
  file: File;
  status: QueueItemStatus;
  /**
   * Best-effort name parsed from the PDF filename. Lab PDFs follow
   * `LASTNAME_FIRSTNAME_*.pdf` (e.g. SILKIN_LARISSA_…pdf). Null when
   * the filename doesn't match that shape — in which case no mismatch
   * detection runs and no override is required.
   */
  detectedName: { first: string; last: string; display: string } | null;
  /** Admin explicitly accepted a detected name-vs-profile mismatch. */
  overridden: boolean;
}

/**
 * Parse a "LASTNAME_FIRSTNAME_..." pattern out of a PDF filename. We
 * only treat the result as confident if both parts are alphabetic,
 * since arbitrary filenames like "results-2024-04.pdf" should NOT
 * trigger spurious mismatch warnings.
 */
function detectNameFromFilename(
  fileName: string,
): { first: string; last: string; display: string } | null {
  const stem = fileName.replace(/\.pdf$/i, "");
  const parts = stem.split("_");
  if (parts.length < 2) return null;
  const last = parts[0].trim();
  const first = parts[1].trim();
  if (!/^[A-Za-z'-]{2,}$/.test(last)) return null;
  if (!/^[A-Za-z'-]{2,}$/.test(first)) return null;
  const cap = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return {
    first: cap(first),
    last: cap(last),
    display: `${cap(first)} ${cap(last)}`,
  };
}

/**
 * True when the detected name's first AND last both appear (case-
 * insensitive, hyphen-tolerant) somewhere in the profile name. We're
 * permissive on ordering because profiles can be stored as either
 * "First Last" or "Last, First" — so we just check word membership.
 */
function namesMatchProfile(
  detected: { first: string; last: string },
  profileName: string,
): boolean {
  const tokens = new Set(
    profileName
      .toLowerCase()
      .split(/[\s,]+/)
      .flatMap((t) => t.split("-"))
      .filter(Boolean),
  );
  return (
    tokens.has(detected.first.toLowerCase()) &&
    tokens.has(detected.last.toLowerCase())
  );
}

function OrderUploadCard({
  order,
  expanded,
  onToggleExpand,
}: {
  order: PendingOrder;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [results, setResults] = useState<OrderResultRow[]>(order.results);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [resultStatus, setResultStatus] = useState<"partial" | "final">(
    "final",
  );
  const [batchError, setBatchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justNotified, setJustNotified] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIdRef = useRef<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const status = useMemo(() => deriveStatus(results), [results]);
  const pendingDays = useMemo(
    () => daysSince(order.createdAt),
    [order.createdAt],
  );
  const pendingColor = pendingDays > 7 ? "#c4973a" : "#6ab04c";

  const skuList = useMemo(() => {
    const skus = order.mayoTests
      .map((t) => t.sku)
      .filter((s): s is string => !!s);
    if (skus.length === 0) return null;
    if (skus.length <= 4) return skus.join(", ");
    return `${skus.slice(0, 4).join(", ")} +${skus.length - 4} more`;
  }, [order.mayoTests]);

  const addFilesToQueue = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const errors: string[] = [];
    const accepted: QueueItem[] = [];
    for (const f of incoming) {
      if (f.type !== "application/pdf") {
        errors.push(`${f.name}: only PDF files are accepted.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        errors.push(`${f.name}: exceeds 25 MB.`);
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: { state: "pending" },
        detectedName: detectNameFromFilename(f.name),
        overridden: false,
      });
    }
    setQueue((prev) => {
      const combined = [...prev, ...accepted];
      if (combined.length > MAX_BATCH) {
        errors.push(`Batch capped at ${MAX_BATCH} files — extras dropped.`);
        return combined.slice(0, MAX_BATCH);
      }
      return combined;
    });
    setBatchError(errors.length > 0 ? errors.join(" ") : null);
  }, []);

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const setOverridden = (id: string, value: boolean) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, overridden: value } : q)),
    );
  };

  /**
   * True if this file's parsed name doesn't match the order's client.
   * Skips detection (returns false) when the filename didn't yield a
   * confident name — we don't want to nag admins on every PDF.
   */
  const itemHasMismatch = (item: QueueItem): boolean => {
    if (!item.detectedName) return false;
    return !namesMatchProfile(item.detectedName, order.patientName);
  };

  const handleUploadAndNotify = async () => {
    setBatchError(null);
    const pending = queue.filter(
      (q) => q.status.state === "pending" || q.status.state === "error",
    );
    if (pending.length === 0) return;

    setSubmitting(true);
    setQueue((prev) =>
      prev.map((q) =>
        pending.some((p) => p.id === q.id)
          ? { ...q, status: { state: "uploading", progress: 0 } }
          : q,
      ),
    );

    try {
      const fd = new FormData();
      fd.append("order_id", order.orderId);
      fd.append("result_status", resultStatus);
      for (const it of pending) fd.append("file", it.file);

      // Per-file mismatch overrides: one entry per file the admin
      // explicitly accepted despite a name mismatch. The API uses this
      // to write the audit row only for files that actually had to be
      // overridden — not every batch carries one.
      const overrides = pending
        .filter((it) => it.overridden && itemHasMismatch(it))
        .map((it) => ({
          file_name: it.file.name,
          detected_pdf_name: it.detectedName?.display ?? null,
          client_profile_name: order.patientName,
        }));
      if (overrides.length > 0) {
        fd.append("mismatch_overrides", JSON.stringify(overrides));
      }

      const res = await fetch("/api/results/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        uploaded?: Array<{ id: string; file_name: string }>;
        failed?: Array<{ file_name: string; error: string }>;
        notified?: boolean;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const successes = new Set(
        (data.uploaded ?? []).map((u) => u.file_name),
      );
      const failures = new Map<string, string>(
        (data.failed ?? []).map((f) => [f.file_name, f.error]),
      );

      // Mark each queue row + add successful rows to the uploaded list.
      setQueue((prev) =>
        prev
          .map((q) => {
            if (!pending.some((p) => p.id === q.id)) return q;
            if (successes.has(q.file.name))
              return { ...q, status: { state: "done" as const } };
            if (failures.has(q.file.name))
              return {
                ...q,
                status: {
                  state: "error" as const,
                  message: failures.get(q.file.name) ?? "Upload failed",
                },
              };
            return {
              ...q,
              status: {
                state: "error" as const,
                message: "No response for this file",
              },
            };
          })
          // Drop the just-completed rows so the queue clears on success.
          .filter((q) => q.status.state !== "done"),
      );

      if (data.uploaded && data.uploaded.length > 0) {
        const newRows: OrderResultRow[] = data.uploaded.map((u) => ({
          id: u.id,
          storage_path: "",
          file_name: u.file_name,
          result_status: resultStatus,
          uploaded_at: new Date().toISOString(),
          lab_reference_number: null,
        }));
        setResults((prev) => [...newRows, ...prev]);
        if (data.notified) {
          setJustNotified(true);
          setTimeout(() => setJustNotified(false), 6000);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setQueue((prev) =>
        prev.map((q) =>
          pending.some((p) => p.id === q.id)
            ? { ...q, status: { state: "error", message: msg } }
            : q,
        ),
      );
      setBatchError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const viewPdf = async (id: string) => {
    try {
      const res = await fetch("/api/results/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to open PDF");
    }
  };

  const triggerReplace = (id: string) => {
    replaceTargetIdRef.current = id;
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (file: File) => {
    const id = replaceTargetIdRef.current;
    replaceTargetIdRef.current = null;
    if (!id) return;
    if (file.type !== "application/pdf") {
      setBatchError(`${file.name}: only PDF files are accepted.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setBatchError(`${file.name}: exceeds 25 MB.`);
      return;
    }
    setReplacingId(id);
    setBatchError(null);
    try {
      const fd = new FormData();
      fd.append("result_id", id);
      fd.append("file", file);
      const res = await fetch("/api/results/replace", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        result_id?: string;
        file_name?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                file_name: data.file_name ?? file.name,
                uploaded_at: new Date().toISOString(),
              }
            : r,
        ),
      );
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setReplacingId(null);
    }
  };

  const confirmDeletePdf = async () => {
    const id = pendingDeleteId;
    if (!id) return;
    try {
      const res = await fetch("/api/results/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPendingDeleteId(null);
    }
  };

  const pendingCount = queue.filter(
    (q) => q.status.state === "pending" || q.status.state === "error",
  ).length;

  // Any submittable file whose name mismatches but isn't yet overridden
  // blocks the whole batch. Each mismatch must be explicitly
  // acknowledged per-file — no bulk skip.
  const unacknowledgedMismatch = queue.some(
    (q) =>
      (q.status.state === "pending" || q.status.state === "error") &&
      itemHasMismatch(q) &&
      !q.overridden,
  );

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      {/* ── Collapsed summary row ─────────────── */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="w-full text-left px-4 sm:px-5 py-3 transition-colors hover:bg-[#1f4a28]"
        style={{ backgroundColor: "#0f2614" }}
      >
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
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
              {results.length > 0 && (
                <span
                  className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "rgba(141,198,63,0.15)",
                    color: "#8dc63f",
                  }}
                >
                  {results.length} PDF{results.length === 1 ? "" : "s"}
                </span>
              )}
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

      {/* ── Expanded body ─────────────────────── */}
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

        {/* Uploaded PDFs list */}
        {results.length > 0 && (
          <div className="mb-4">
            <p
              className="text-xs uppercase tracking-wider mb-2 font-semibold"
              style={{ color: "#c4973a" }}
            >
              Uploaded PDFs ({results.length})
            </p>
            <ul className="space-y-1.5">
              {results.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border"
                  style={{
                    backgroundColor: "#0f2614",
                    borderColor: "#2d6b35",
                  }}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {r.result_status === "partial" ? (
                      <Clock
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: "#c4973a" }}
                      />
                    ) : (
                      <CheckCircle
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{ color: "#8dc63f" }}
                      />
                    )}
                    <div className="min-w-0">
                      <p
                        className="text-sm break-words"
                        style={{ color: "#ffffff", overflowWrap: "anywhere" }}
                      >
                        {r.file_name}
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: "#6ab04c" }}
                      >
                        {r.result_status === "partial" ? "Partial" : "Final"}
                        {" · "}Uploaded {formatDate(r.uploaded_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => viewPdf(r.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border"
                      style={{
                        backgroundColor: "transparent",
                        borderColor: "#2d6b35",
                        color: "#e8d5a3",
                      }}
                    >
                      <Eye className="w-3 h-3" />
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerReplace(r.id)}
                      disabled={replacingId === r.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border disabled:opacity-50"
                      style={{
                        backgroundColor: "transparent",
                        borderColor: "#2d6b35",
                        color: "#e8d5a3",
                      }}
                    >
                      {replacingId === r.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(r.id)}
                      className="p-1.5 rounded"
                      style={{ color: "#e05252" }}
                      aria-label="Delete PDF"
                      title="Delete this PDF"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <input
              ref={replaceInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleReplaceFile(f);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {justNotified && (
          <div
            className="flex items-center gap-3 rounded-lg border p-3 mb-4"
            style={{
              backgroundColor: "rgba(141,198,63,0.12)",
              borderColor: "#8dc63f",
            }}
          >
            <CheckCircle
              className="w-5 h-5 shrink-0"
              style={{ color: "#8dc63f" }}
            />
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: "#ffffff" }}
              >
                Batch uploaded — customer notified by email (and SMS if on file)
              </p>
              <p className="text-xs" style={{ color: "#8dc63f" }}>
                {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Drop zone (always available so admins can add another batch) */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length > 0)
              addFilesToQueue(e.dataTransfer.files);
          }}
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors"
          style={{
            borderColor: dragging ? "#c4973a" : "#2d6b35",
            backgroundColor: dragging ? "#1f4a28" : "#0f2614",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFilesToQueue(e.target.files);
              e.target.value = "";
            }}
          />
          <Upload
            className="w-8 h-8 mx-auto mb-2"
            style={{ color: "#6ab04c" }}
          />
          <p className="text-sm" style={{ color: "#e8d5a3" }}>
            <span className="font-semibold" style={{ color: "#c4973a" }}>
              Drop PDFs here
            </span>{" "}
            or click to upload — multiple files supported
          </p>
          <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
            PDF only · 25 MB max · up to {MAX_BATCH} per batch · one email per
            batch
          </p>
        </div>

        {/* Queue */}
        {queue.length > 0 && (
          <ul className="space-y-1.5 mt-4">
            {queue.map((q) => (
              <QueueRow
                key={q.id}
                item={q}
                profileName={order.patientName}
                hasMismatch={itemHasMismatch(q)}
                onRemove={removeFromQueue}
                onOverrideChange={setOverridden}
              />
            ))}
          </ul>
        )}

        {batchError && (
          <p
            className="mt-3 text-xs flex items-start gap-1.5"
            style={{ color: "#e05252" }}
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{batchError}</span>
          </p>
        )}

        {/* Status toggle + Upload & Notify button */}
        {queue.length > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-4">
              <p
                className="text-xs font-medium"
                style={{ color: "#e8d5a3" }}
              >
                Status:
              </p>
              {(["final", "partial"] as const).map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="radio"
                    name={`status-${order.orderId}`}
                    value={s}
                    checked={resultStatus === s}
                    onChange={() => setResultStatus(s)}
                    style={{ accentColor: "#c4973a" }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{
                      color:
                        resultStatus === s
                          ? s === "partial"
                            ? "#c4973a"
                            : "#8dc63f"
                          : "#6ab04c",
                    }}
                  >
                    {s === "final" ? "Final Results" : "Partial Results"}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={handleUploadAndNotify}
              disabled={
                submitting || pendingCount === 0 || unacknowledgedMismatch
              }
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload & Notify ({pendingCount})
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {pendingDeleteId && (
        <DeleteConfirmModal
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={confirmDeletePdf}
        />
      )}
    </div>
  );
}

function QueueRow({
  item,
  profileName,
  hasMismatch,
  onRemove,
  onOverrideChange,
}: {
  item: QueueItem;
  profileName: string;
  hasMismatch: boolean;
  onRemove: (id: string) => void;
  onOverrideChange: (id: string, value: boolean) => void;
}) {
  const s = item.status;
  const icon =
    s.state === "done" ? (
      <CheckCircle className="w-4 h-4" style={{ color: "#8dc63f" }} />
    ) : s.state === "error" ? (
      <AlertCircle className="w-4 h-4" style={{ color: "#e05252" }} />
    ) : s.state === "uploading" ? (
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#c4973a" }} />
    ) : hasMismatch ? (
      <AlertTriangle className="w-4 h-4" style={{ color: "#e05252" }} />
    ) : (
      <FileText className="w-4 h-4" style={{ color: "#6ab04c" }} />
    );

  const removable = s.state === "pending" || s.state === "error";
  // Mismatch warning blocks submission unless explicitly overridden.
  // Only render the warning while the file is queue-resident (pending
  // or error) — once it's uploading/done, the warning is moot.
  const showMismatch =
    hasMismatch && (s.state === "pending" || s.state === "error");

  return (
    <li
      className="rounded-lg border"
      style={{
        backgroundColor: "#0f2614",
        borderColor:
          s.state === "error"
            ? "#e05252"
            : showMismatch
              ? "#e05252"
              : "#2d6b35",
      }}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        {icon}
        <div className="min-w-0 flex-1">
          <p
            className="text-sm truncate"
            style={{ color: "#ffffff" }}
            title={item.file.name}
          >
            {item.file.name}
          </p>
          <p className="text-[11px]" style={{ color: "#6ab04c" }}>
            {formatBytes(item.file.size)}
          </p>
          {s.state === "error" && (
            <p className="text-xs mt-0.5" style={{ color: "#e05252" }}>
              {s.message}
            </p>
          )}
        </div>
        {removable && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Remove from queue"
            style={{ color: "#6ab04c" }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showMismatch && (
        <div
          className="border-t px-3 py-2.5 space-y-2"
          style={{
            borderColor: "#e05252",
            backgroundColor: "rgba(224, 82, 82, 0.08)",
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="w-3.5 h-3.5 shrink-0 mt-0.5"
              style={{ color: "#e05252" }}
            />
            <p className="text-xs leading-relaxed" style={{ color: "#e8d5a3" }}>
              <span className="font-semibold" style={{ color: "#e05252" }}>
                Possible patient mismatch.
              </span>{" "}
              This PDF appears to be for{" "}
              <strong style={{ color: "#ffffff" }}>
                {item.detectedName?.display ?? "—"}
              </strong>
              , but this order is on{" "}
              <strong style={{ color: "#ffffff" }}>{profileName}</strong>
              &apos;s account.
            </p>
          </div>
          <label className="flex items-start gap-2 cursor-pointer pl-5">
            <input
              type="checkbox"
              checked={item.overridden}
              onChange={(e) => onOverrideChange(item.id, e.target.checked)}
              className="mt-0.5 shrink-0"
              style={{ accentColor: "#c4973a" }}
            />
            <span className="text-xs" style={{ color: "#e8d5a3" }}>
              <span className="font-semibold" style={{ color: "#c4973a" }}>
                Override and upload anyway
              </span>
              <span
                className="block text-[11px] mt-0.5"
                style={{ color: "#6ab04c" }}
              >
                Use only when you&apos;ve confirmed this PDF is for the
                correct client (e.g., results for a family member ordered
                under this account).
              </span>
            </span>
          </label>
        </div>
      )}
    </li>
  );
}

function DeleteConfirmModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl border max-w-md w-full p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="font-heading text-lg font-semibold mb-2"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Delete this PDF?
        </h3>
        <p className="text-sm mb-5" style={{ color: "#e8d5a3" }}>
          The customer will no longer see this file. No email is sent. This
          cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-lg text-sm font-medium border"
            style={{
              backgroundColor: "transparent",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: "#e05252", color: "#ffffff" }}
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
