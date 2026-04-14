"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  CloudUpload,
  Trash2,
} from "lucide-react";

const MAX_BYTES = 20 * 1024 * 1024;

type QueueStatus =
  | { state: "pending"; progress: 0 }
  | { state: "uploading"; progress: number }
  | { state: "done" }
  | { state: "error"; message: string };

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
}

export function MyRecordsUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const addFiles = (files: FileList | File[]) => {
    const incoming: QueueItem[] = Array.from(files).map((f, i) => {
      let status: QueueStatus = { state: "pending", progress: 0 };
      if (f.type !== "application/pdf") {
        status = { state: "error", message: "Only PDF files are accepted" };
      } else if (f.size > MAX_BYTES) {
        status = {
          state: "error",
          message: `File exceeds 20 MB (${Math.round(f.size / 1024 / 1024)} MB)`,
        };
      }
      return {
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        status,
      };
    });
    setQueue((prev) => [...prev, ...incoming]);
  };

  const uploadOne = (item: QueueItem): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", item.file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/portal/my-records", true);
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
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data?.error ?? `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
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
    const pending = queue.filter((q) => q.status.state === "pending");
    for (const item of pending) {
      try {
        const data = (await uploadOne(item)) as {
          failed?: Array<{ file_name: string; error: string }>;
        };
        const fail = data.failed?.[0];
        if (fail) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? { ...q, status: { state: "error", message: fail.error } }
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

  const removeItem = (id: string) =>
    setQueue((prev) => prev.filter((q) => q.id !== id));

  const hasPending = queue.some((q) => q.status.state === "pending");

  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <h2
        className="font-heading text-xl font-semibold mb-1"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Upload My Records
      </h2>
      <p className="text-xs mb-4" style={{ color: "#6ab04c" }}>
        Add PDFs from other labs or doctor reports. Stored securely in your
        portal — max 20 MB per file. You can delete your own uploads at any
        time.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-colors"
        style={{
          backgroundColor: dragOver ? "rgba(196,151,58,0.1)" : "#0f2614",
          borderColor: dragOver ? "#c4973a" : "#2d6b35",
        }}
      >
        <CloudUpload
          className="w-8 h-8 mx-auto mb-2"
          style={{ color: dragOver ? "#c4973a" : "#6ab04c" }}
        />
        <p className="text-sm font-medium" style={{ color: "#ffffff" }}>
          Drag and drop PDFs here
        </p>
        <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
          or click to browse — multiple files supported, up to 20 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 && (
        <div className="mt-4 space-y-2">
          {queue.map((q) => (
            <QueueRow key={q.id} item={q} onRemove={removeItem} />
          ))}
          {hasPending && (
            <button
              type="button"
              onClick={startUploads}
              className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
            >
              <Upload className="w-4 h-4" />
              Upload{" "}
              {queue.filter((q) => q.status.state === "pending").length} file
              {queue.filter((q) => q.status.state === "pending").length !== 1
                ? "s"
                : ""}
            </button>
          )}
        </div>
      )}
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
  const icon =
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
      {icon}
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
