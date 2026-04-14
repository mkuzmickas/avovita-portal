"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  Loader2,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle,
  CloudUpload,
} from "lucide-react";
import type { PatientRepositoryResult } from "@/app/(admin)/admin/patients/[id]/page";

interface ProfileOption {
  id: string;
  label: string;
}

interface Props {
  accountId: string;
  profiles: ProfileOption[];
  initialResults: PatientRepositoryResult[];
}

type FileUploadStatus =
  | { state: "pending"; progress: 0 }
  | { state: "uploading"; progress: number }
  | { state: "done" }
  | { state: "error"; message: string };

interface QueueItem {
  id: string; // local id
  file: File;
  status: FileUploadStatus;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFilesToQueue = useCallback((fileList: FileList | File[]) => {
    const incoming: QueueItem[] = Array.from(fileList)
      .filter((f) => f.type === "application/pdf")
      .map((f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        status: { state: "pending", progress: 0 },
      }));
    if (incoming.length === 0) return;
    setQueue((prev) => [...prev, ...incoming]);
  }, []);

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  /**
   * XMLHttpRequest lets us observe upload progress — the fetch API doesn't
   * expose it yet. Resolves with the parsed JSON response.
   */
  const uploadOne = (item: QueueItem): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("profile_id", selectedProfile);
      fd.append("file", item.file);

      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `/api/admin/patients/${accountId}/results`,
        true
      );

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: { state: "uploading", progress: pct } }
              : q
          )
        );
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data?.error ?? `HTTP ${xhr.status}`));
          }
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.onabort = () => reject(new Error("Aborted"));

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: { state: "uploading", progress: 0 } }
            : q
        )
      );
      xhr.send(fd);
    });
  };

  const startUploads = async () => {
    if (!selectedProfile) return;
    const pending = queue.filter((q) => q.status.state === "pending");
    for (const item of pending) {
      try {
        const data = (await uploadOne(item)) as {
          uploaded?: Array<{ id: string; file_name: string }>;
          failed?: Array<{ file_name: string; error: string }>;
        };
        const failure = data.failed?.[0];
        if (failure) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: { state: "error", message: failure.error },
                  }
                : q
            )
          );
          continue;
        }
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: { state: "done" } } : q
          )
        );
      } catch (err) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: {
                    state: "error",
                    message: err instanceof Error ? err.message : "Upload failed",
                  },
                }
              : q
          )
        );
      }
    }
    router.refresh();
  };

  const clearDoneQueue = () => {
    setQueue((prev) => prev.filter((q) => q.status.state !== "done"));
  };

  const downloadResult = async (id: string) => {
    window.open(`/api/results/view?id=${id}`, "_blank");
  };

  const deleteResult = async (id: string) => {
    if (!confirm("Delete this file permanently?")) return;
    const res = await fetch(
      `/api/admin/patients/${accountId}/results/${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed to delete: ${data.error ?? res.statusText}`);
      return;
    }
    setResults((prev) => prev.filter((r) => r.id !== id));
  };

  const hasPendingQueue = queue.some((q) => q.status.state === "pending");
  const allUploadsSettled =
    queue.length > 0 &&
    queue.every(
      (q) =>
        q.status.state === "done" || q.status.state === "error"
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
        these in their portal alongside order-attached results — no
        notification is sent.
      </p>

      {/* Profile picker */}
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
          backgroundColor: dragOver
            ? "rgba(196,151,58,0.1)"
            : "#0f2614",
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
          or click to browse — multiple files supported
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

      {/* Upload queue */}
      {queue.length > 0 && (
        <div className="mt-4 space-y-2">
          {queue.map((q) => (
            <QueueRow key={q.id} item={q} onRemove={removeFromQueue} />
          ))}
          <div className="flex items-center gap-2 pt-1">
            {hasPendingQueue && (
              <button
                type="button"
                onClick={startUploads}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
              >
                <Upload className="w-4 h-4" />
                Upload{" "}
                {queue.filter((q) => q.status.state === "pending").length}{" "}
                file
                {queue.filter((q) => q.status.state === "pending").length !== 1
                  ? "s"
                  : ""}
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
      )}

      {/* Existing results */}
      <div className="mt-6">
        <h3
          className="text-xs uppercase tracking-wider mb-2 font-bold"
          style={{ color: "#c4973a" }}
        >
          Files in repository ({results.length})
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
            No manually-uploaded files yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: "#2d6b35",
                }}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <FileText
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: "#c4973a" }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span
                        className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
                        style={
                          r.source === "patient_upload"
                            ? {
                                backgroundColor: "rgba(106,176,76,0.12)",
                                color: "#6ab04c",
                                borderColor: "#6ab04c",
                              }
                            : {
                                backgroundColor: "rgba(196,151,58,0.12)",
                                color: "#c4973a",
                                borderColor: "#c4973a",
                              }
                        }
                      >
                        {r.source === "patient_upload"
                          ? "Patient uploaded"
                          : "Staff uploaded"}
                      </span>
                    </div>
                    <p
                      className="text-sm break-words"
                      style={{ color: "#ffffff", overflowWrap: "anywhere" }}
                    >
                      {r.file_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                      {r.profile_label} · {formatDate(r.uploaded_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadResult(r.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border"
                    style={{
                      backgroundColor: "transparent",
                      borderColor: "#2d6b35",
                      color: "#e8d5a3",
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    View
                  </button>
                  {r.source === "manual_upload" && (
                    <button
                      type="button"
                      onClick={() => deleteResult(r.id)}
                      className="p-1.5 rounded-lg"
                      style={{ color: "#e05252" }}
                      aria-label="Delete"
                      title="Delete this admin-uploaded file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function QueueRow({
  item,
  onRemove,
}: {
  item: QueueItem;
  onRemove: (id: string) => void;
}) {
  const s = item.status;
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
      className="flex items-center gap-3 px-3 py-2 rounded-lg border"
      style={{
        backgroundColor: "#0f2614",
        borderColor: s.state === "error" ? "#e05252" : "#2d6b35",
      }}
    >
      {statusIcon}
      <div className="min-w-0 flex-1">
        <p
          className="text-sm truncate"
          style={{ color: "#ffffff" }}
          title={item.file.name}
        >
          {item.file.name}
        </p>
        {s.state === "uploading" && (
          <div
            className="mt-1 h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: "#1a3d22" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${s.progress}%`,
                backgroundColor: "#c4973a",
              }}
            />
          </div>
        )}
        {s.state === "error" && (
          <p className="text-xs mt-0.5" style={{ color: "#e05252" }}>
            {s.message}
          </p>
        )}
      </div>
      {(s.state === "pending" || s.state === "error") && (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label="Remove"
          style={{ color: "#6ab04c" }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
