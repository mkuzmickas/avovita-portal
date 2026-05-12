"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  Loader2,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle,
  CloudUpload,
  X,
} from "lucide-react";
import type { PatientRepositoryResult } from "@/app/(admin)/admin/patients/[id]/page";
import { classifyResultRow } from "@/lib/results/classify";

interface ProfileOption {
  id: string;
  label: string;
}

interface Props {
  accountId: string;
  profiles: ProfileOption[];
  initialResults: PatientRepositoryResult[];
}

const DOC_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "lab_result", label: "Lab Result" },
  { value: "imaging_report", label: "Imaging Report" },
  { value: "specialist_report", label: "Specialist Report" },
  { value: "medical_history", label: "Medical History" },
  { value: "prescription", label: "Prescription" },
  { value: "other", label: "Other" },
];
const DOC_TYPE_LABEL = new Map(
  DOC_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

const MAX_BATCH = 20;
const MAX_BYTES = 25 * 1024 * 1024;

type FileUploadStatus =
  | { state: "pending"; progress: 0 }
  | { state: "uploading"; progress: number }
  | { state: "done" }
  | { state: "error"; message: string };

interface QueueItem {
  id: string;
  file: File;
  document_type: string;
  document_date: string; // empty string = unset → server stores null
  description: string;
  result_status: "final" | "partial";
  status: FileUploadStatus;
}

function todayLocalIso(): string {
  // YYYY-MM-DD in local time — used as the default document date so a
  // backdated upload requires deliberate editing.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PatientResultsRepository({
  accountId,
  profiles,
  initialResults,
}: Props) {
  const router = useRouter();
  const [results, setResults] = useState(initialResults);
  const [selectedProfile, setSelectedProfile] = useState(
    profiles[0]?.id ?? ""
  );
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFilesToQueue = useCallback(
    (fileList: FileList | File[]) => {
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
          document_type: "lab_result",
          document_date: todayLocalIso(),
          description: "",
          result_status: "final",
          status: { state: "pending", progress: 0 },
        });
      }
      setQueue((prev) => {
        const combined = [...prev, ...accepted];
        if (combined.length > MAX_BATCH) {
          errors.push(
            `Batch capped at ${MAX_BATCH} files — extras dropped.`
          );
          return combined.slice(0, MAX_BATCH);
        }
        return combined;
      });
      setBatchError(errors.length > 0 ? errors.join(" ") : null);
    },
    []
  );

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const updateQueueItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  };

  const uploadBatch = (
    items: QueueItem[],
    extras: { profileId: string; notify: boolean }
  ): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("profile_id", extras.profileId);
      if (extras.notify) fd.append("notify_email", "1");
      const meta = items.map((it) => ({
        document_type: it.document_type,
        document_date: it.document_date || null,
        description: it.description || null,
        result_status: it.result_status,
      }));
      fd.append("meta", JSON.stringify(meta));
      for (const it of items) fd.append("file", it.file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/admin/patients/${accountId}/results`, true);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        // Bulk progress across the whole batch — apply same pct to each
        // pending row so the user sees movement on every file.
        setQueue((prev) =>
          prev.map((q) =>
            items.some((it) => it.id === q.id) &&
            q.status.state !== "done" &&
            q.status.state !== "error"
              ? { ...q, status: { state: "uploading", progress: pct } }
              : q
          )
        );
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data?.error ?? `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.onabort = () => reject(new Error("Aborted"));

      setQueue((prev) =>
        prev.map((q) =>
          items.some((it) => it.id === q.id)
            ? { ...q, status: { state: "uploading", progress: 0 } }
            : q
        )
      );
      xhr.send(fd);
    });
  };

  const startUploads = async () => {
    setBatchError(null);
    if (!selectedProfile) {
      setBatchError("Pick a profile before uploading.");
      return;
    }
    const pending = queue.filter(
      (q) => q.status.state === "pending" || q.status.state === "error"
    );
    if (pending.length === 0) return;

    // Validate each pending row before hitting the network.
    const missing = pending.find((p) => !p.document_type);
    if (missing) {
      setBatchError(
        `Pick a document type for "${missing.file.name}" before uploading.`
      );
      return;
    }

    try {
      const data = (await uploadBatch(pending, {
        profileId: selectedProfile,
        notify: notifyEmail,
      })) as {
        uploaded?: Array<{ id: string; file_name: string }>;
        failed?: Array<{ file_name: string; error: string }>;
      };
      const successes = new Set(
        (data.uploaded ?? []).map((u) => u.file_name)
      );
      const failures = new Map<string, string>(
        (data.failed ?? []).map((f) => [f.file_name, f.error])
      );

      setQueue((prev) =>
        prev.map((q) => {
          if (!pending.some((p) => p.id === q.id)) return q;
          if (successes.has(q.file.name)) {
            return { ...q, status: { state: "done" } };
          }
          if (failures.has(q.file.name)) {
            return {
              ...q,
              status: {
                state: "error",
                message: failures.get(q.file.name) ?? "Upload failed",
              },
            };
          }
          // No record returned — treat as failure.
          return {
            ...q,
            status: { state: "error", message: "No response for this file" },
          };
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setQueue((prev) =>
        prev.map((q) =>
          pending.some((p) => p.id === q.id)
            ? { ...q, status: { state: "error", message: msg } }
            : q
        )
      );
      setBatchError(msg);
    } finally {
      router.refresh();
    }
  };

  const clearDoneQueue = () => {
    setQueue((prev) => prev.filter((q) => q.status.state !== "done"));
  };

  /**
   * Open a signed URL in a new tab. The /api/results/view endpoint is
   * POST-only and returns { url }, so we fetch first, then window.open.
   * (Direct GET on /api/results/view would 405.)
   */
  const viewResult = async (id: string) => {
    try {
      const res = await fetch("/api/results/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to open file");
    }
  };

  const [pendingDelete, setPendingDelete] = useState<
    PatientRepositoryResult | null
  >(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    const res = await fetch(
      `/api/admin/patients/${accountId}/results/${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed to delete: ${data.error ?? res.statusText}`);
      setPendingDelete(null);
      return;
    }
    setResults((prev) => prev.filter((r) => r.id !== id));
    setPendingDelete(null);
    router.refresh();
  };

  const pendingCount = queue.filter(
    (q) => q.status.state === "pending" || q.status.state === "error"
  ).length;
  const allUploadsSettled =
    queue.length > 0 &&
    queue.every(
      (q) => q.status.state === "done" || q.status.state === "error"
    );
  const canSubmit = useMemo(
    () =>
      pendingCount > 0 &&
      !!selectedProfile &&
      queue.every((q) => !!q.document_type),
    [queue, pendingCount, selectedProfile]
  );

  if (profiles.length === 0) {
    return (
      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h2
          className="font-heading text-xl font-semibold mb-2"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Results Repository
        </h2>
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          Add at least one profile to this account before uploading results.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border p-5"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <h2
        className="font-heading text-xl font-semibold mb-1"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Results Repository
      </h2>
      <p className="text-xs mb-4" style={{ color: "#6ab04c" }}>
        Manually upload PDFs without requiring an open order. Patients see
        these in their portal alongside order-attached results.
      </p>

      {/* Profile picker — applies to every file in this batch */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "#e8d5a3" }}
          >
            Attach to profile
          </label>
          <select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            className="mf-input cursor-pointer"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) {
            addFilesToQueue(e.dataTransfer.files);
          }
        }}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
        style={{
          backgroundColor: dragOver ? "rgba(196,151,58,0.1)" : "#0f2614",
          borderColor: dragOver ? "#c4973a" : "#2d6b35",
        }}
      >
        <CloudUpload
          className="w-10 h-10 mx-auto mb-2"
          style={{ color: dragOver ? "#c4973a" : "#6ab04c" }}
        />
        <p className="text-sm font-medium" style={{ color: "#ffffff" }}>
          Drag and drop PDFs here
        </p>
        <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
          or click to browse — multiple files supported (PDF only · 25 MB
          max · up to {MAX_BATCH} per batch)
        </p>
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
      </div>

      {batchError && (
        <p
          className="mt-3 text-xs flex items-start gap-1.5"
          style={{ color: "#e05252" }}
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{batchError}</span>
        </p>
      )}

      {/* Upload queue with per-file metadata */}
      {queue.length > 0 && (
        <div className="mt-4 space-y-2">
          {queue.map((q) => (
            <QueueRow
              key={q.id}
              item={q}
              onRemove={removeFromQueue}
              onChange={updateQueueItem}
            />
          ))}

          {/* Notify checkbox + submit row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <label
              className="inline-flex items-center gap-2 text-sm cursor-pointer select-none"
              style={{ color: "#e8d5a3" }}
            >
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                style={{ accentColor: "#c4973a" }}
              />
              Notify customer by email
            </label>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={startUploads}
                  disabled={!canSubmit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                >
                  <Upload className="w-4 h-4" />
                  Upload all ({pendingCount})
                </button>
              )}
              {allUploadsSettled && (
                <button
                  type="button"
                  onClick={clearDoneQueue}
                  className="text-xs"
                  style={{ color: "#6ab04c" }}
                >
                  Clear finished
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mixed list of every result on the account (manual + order) */}
      <div className="mt-6">
        <h3
          className="text-xs uppercase tracking-wider mb-2 font-bold"
          style={{ color: "#c4973a" }}
        >
          Files on this account ({results.length})
        </h3>
        {results.length === 0 ? (
          <p
            className="text-sm italic px-3 py-6 rounded-lg border text-center"
            style={{
              color: "#6ab04c",
              backgroundColor: "#0f2614",
              borderColor: "#2d6b35",
            }}
          >
            No files uploaded yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((r) => (
              <ResultRow
                key={r.id}
                result={r}
                onView={viewResult}
                onDelete={(row) => setPendingDelete(row)}
              />
            ))}
          </ul>
        )}
      </div>

      {pendingDelete && (
        <DeleteConfirmModal
          fileName={pendingDelete.file_name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}

function QueueRow({
  item,
  onRemove,
  onChange,
}: {
  item: QueueItem;
  onRemove: (id: string) => void;
  onChange: (id: string, patch: Partial<QueueItem>) => void;
}) {
  const s = item.status;
  const editable = s.state === "pending" || s.state === "error";
  const statusIcon =
    s.state === "done" ? (
      <CheckCircle className="w-4 h-4" style={{ color: "#8dc63f" }} />
    ) : s.state === "error" ? (
      <AlertCircle className="w-4 h-4" style={{ color: "#e05252" }} />
    ) : s.state === "uploading" ? (
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#c4973a" }} />
    ) : (
      <FileText className="w-4 h-4" style={{ color: "#6ab04c" }} />
    );

  return (
    <div
      className="px-3 py-3 rounded-lg border space-y-2"
      style={{
        backgroundColor: "#0f2614",
        borderColor: s.state === "error" ? "#e05252" : "#2d6b35",
      }}
    >
      <div className="flex items-center gap-3">
        {statusIcon}
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
          {s.state === "uploading" && (
            <div
              className="mt-1 h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: "#1a3d22" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${s.progress}%`, backgroundColor: "#c4973a" }}
              />
            </div>
          )}
          {s.state === "error" && (
            <p className="text-xs mt-0.5" style={{ color: "#e05252" }}>
              {s.message}
            </p>
          )}
        </div>
        {editable && (
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

      {editable && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label
              className="block text-[10px] uppercase tracking-wider mb-1"
              style={{ color: "#c4973a" }}
            >
              Document type
            </label>
            <select
              value={item.document_type}
              onChange={(e) =>
                onChange(item.id, { document_type: e.target.value })
              }
              className="mf-input cursor-pointer text-sm"
            >
              {DOC_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-[10px] uppercase tracking-wider mb-1"
              style={{ color: "#c4973a" }}
            >
              Document date
            </label>
            <input
              type="date"
              value={item.document_date}
              onChange={(e) =>
                onChange(item.id, { document_date: e.target.value })
              }
              className="mf-input text-sm"
            />
          </div>
          <div>
            <label
              className="block text-[10px] uppercase tracking-wider mb-1"
              style={{ color: "#c4973a" }}
            >
              Status
            </label>
            <div className="flex items-center gap-3 pt-1">
              <label
                className="inline-flex items-center gap-1.5 text-xs cursor-pointer"
                style={{ color: "#e8d5a3" }}
              >
                <input
                  type="radio"
                  name={`status-${item.id}`}
                  checked={item.result_status === "final"}
                  onChange={() =>
                    onChange(item.id, { result_status: "final" })
                  }
                  style={{ accentColor: "#c4973a" }}
                />
                Final
              </label>
              <label
                className="inline-flex items-center gap-1.5 text-xs cursor-pointer"
                style={{ color: "#e8d5a3" }}
              >
                <input
                  type="radio"
                  name={`status-${item.id}`}
                  checked={item.result_status === "partial"}
                  onChange={() =>
                    onChange(item.id, { result_status: "partial" })
                  }
                  style={{ accentColor: "#c4973a" }}
                />
                Partial
              </label>
            </div>
          </div>
          <div className="sm:col-span-3">
            <label
              className="block text-[10px] uppercase tracking-wider mb-1"
              style={{ color: "#c4973a" }}
            >
              Description (optional)
            </label>
            <input
              type="text"
              value={item.description}
              onChange={(e) =>
                onChange(item.id, { description: e.target.value })
              }
              placeholder='e.g. "Pre-AvoVita bloodwork from Calgary Lab"'
              maxLength={1000}
              className="mf-input text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  result,
  onView,
  onDelete,
}: {
  result: PatientRepositoryResult;
  onView: (id: string) => void;
  onDelete: (r: PatientRepositoryResult) => void;
}) {
  const kind = classifyResultRow({
    source: result.source,
    order_id: result.order_id,
  });
  const sourceLabel =
    kind === "order"
      ? `Order #${result.order_id_short ?? "—"}`
      : kind === "patient"
      ? "Client uploaded"
      : "Manual upload";

  const sourceColor =
    kind === "order" ? "#8dc63f" : kind === "patient" ? "#6ab04c" : "#c4973a";

  const docTypeLabel = result.document_type
    ? DOC_TYPE_LABEL.get(result.document_type) ?? result.document_type
    : null;

  return (
    <li
      className="flex items-start justify-between gap-3 px-4 py-3 rounded-lg border"
      style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <FileText
          className="w-4 h-4 shrink-0 mt-1"
          style={{ color: "#c4973a" }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
              style={{
                backgroundColor: `${sourceColor}1f`,
                color: sourceColor,
                borderColor: sourceColor,
              }}
            >
              {sourceLabel}
            </span>
            {docTypeLabel && (
              <span
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "#e8d5a3" }}
              >
                {docTypeLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onView(result.id)}
            className="text-sm break-words text-left hover:underline"
            style={{ color: "#ffffff", overflowWrap: "anywhere" }}
            title="Open PDF in new tab"
          >
            {result.file_name}
          </button>
          {result.description && (
            <p
              className="text-xs mt-0.5 italic"
              style={{ color: "#e8d5a3" }}
            >
              {result.description}
            </p>
          )}
          <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
            {result.profile_label}
            {" · "}
            {result.document_date
              ? `Document date ${formatDate(result.document_date)}`
              : `Uploaded ${formatDate(result.uploaded_at)}`}
            {result.uploaded_by_email && (
              <>
                {" · by "}
                {result.uploaded_by_email}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onView(result.id)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border"
          style={{
            backgroundColor: "transparent",
            borderColor: "#2d6b35",
            color: "#e8d5a3",
          }}
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </button>
        {kind === "manual" && (
          <button
            type="button"
            onClick={() => onDelete(result)}
            className="p-1.5 rounded-lg"
            style={{ color: "#e05252" }}
            aria-label="Delete"
            title="Delete this manual upload"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </li>
  );
}

function DeleteConfirmModal({
  fileName,
  onCancel,
  onConfirm,
}: {
  fileName: string;
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
          Permanently delete this PDF?
        </h3>
        <p className="text-sm mb-3" style={{ color: "#e8d5a3" }}>
          {fileName}
        </p>
        <p className="text-sm mb-5" style={{ color: "#6ab04c" }}>
          The customer will no longer see it. This cannot be undone.
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
