"use client";

import { useState, useRef, useCallback } from "react";
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
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { PendingOrder } from "@/app/(admin)/admin/results/page";

interface AdminResultsManagerProps {
  orders: PendingOrder[];
}

export function AdminResultsManager({ orders }: AdminResultsManagerProps) {
  if (orders.length === 0) {
    return (
      <div
        className="rounded-xl border px-6 py-12 text-center"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <CheckCircle
          className="w-10 h-10 mx-auto mb-3"
          style={{ color: "#8dc63f" }}
        />
        <p style={{ color: "#e8d5a3" }}>
          No Mayo Clinic orders requiring upload.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {orders.map((order) => (
        <OrderUploadCard key={order.orderId} order={order} />
      ))}
    </div>
  );
}

function OrderUploadCard({ order }: { order: PendingOrder }) {
  const [result, setResult] = useState(order.existingResult);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(!result);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resultStatus, setResultStatus] = useState<"partial" | "final">(
    "final"
  );
  const [labRef, setLabRef] = useState(
    result?.lab_reference_number ?? ""
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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
    if (labRef.trim()) formData.append("lab_reference_number", labRef.trim());
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
        lab_reference_number: labRef.trim() || null,
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

  const hasResult = !!result;
  const isPartial = result?.result_status === "partial";

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      {/* Order header */}
      <div
        className="px-5 sm:px-6 py-4 border-b"
        style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="font-mono text-xs"
            style={{ color: "#6ab04c" }}
          >
            Order #{order.orderIdShort}
          </span>
          <span className="text-xs" style={{ color: "#6ab04c" }}>·</span>
          <p
            className="text-sm font-semibold"
            style={{ color: "#ffffff" }}
          >
            {order.patientName}
          </p>
          {order.patientEmail !== "—" && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "#e8d5a3" }}
            >
              <Mail className="w-3 h-3" />
              {order.patientEmail}
            </span>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
          Placed {formatDate(order.createdAt)} ·{" "}
          {order.mayoTests.length} Mayo{" "}
          {order.mayoTests.length === 1 ? "test" : "tests"}
        </p>
      </div>

      {/* Mayo tests list */}
      <div className="px-5 sm:px-6 py-4">
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
              <span style={{ color: "#ffffff" }}>{t.name}</span>
              {t.specimenType && (
                <span className="text-xs" style={{ color: "#6ab04c" }}>
                  · {t.specimenType}
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* Existing result status indicator */}
        {hasResult && !showUploadZone && (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border p-4 mb-4"
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
                  {isPartial
                    ? "Partial results on file"
                    : "Final results on file"}
                </p>
                <p className="text-xs" style={{ color: "#6ab04c" }}>
                  Uploaded {formatDate(result!.uploaded_at)}
                  {result!.file_name && (
                    <> · {result!.file_name}</>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowUploadZone(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0"
              style={{
                color: "#e8d5a3",
                borderColor: "#2d6b35",
                backgroundColor: "transparent",
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Replace PDF
            </button>
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
            <CheckCircle
              className="w-5 h-5 shrink-0"
              style={{ color: "#8dc63f" }}
            />
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: "#ffffff" }}
              >
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
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors"
              style={{
                borderColor: dragging
                  ? "#c4973a"
                  : selectedFile
                  ? "#8dc63f"
                  : "#2d6b35",
                backgroundColor: dragging
                  ? "#1f4a28"
                  : selectedFile
                  ? "#1a3d22"
                  : "#0f2614",
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
                  <FileText
                    className="w-5 h-5"
                    style={{ color: "#8dc63f" }}
                  />
                  <span
                    className="text-sm font-medium truncate max-w-xs"
                    style={{ color: "#ffffff" }}
                  >
                    {selectedFile.name}
                  </span>
                  <span className="text-xs" style={{ color: "#6ab04c" }}>
                    ({(selectedFile.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
              ) : (
                <div>
                  <Upload
                    className="w-8 h-8 mx-auto mb-2"
                    style={{ color: "#6ab04c" }}
                  />
                  <p className="text-sm" style={{ color: "#e8d5a3" }}>
                    <span
                      className="font-semibold"
                      style={{ color: "#c4973a" }}
                    >
                      Drop PDF here
                    </span>{" "}
                    or click to upload
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
                    One PDF for all Mayo tests in this order
                  </p>
                </div>
              )}
            </div>

            {/* Result status toggle */}
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
                    className="text-xs font-medium capitalize"
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

            {/* Lab reference */}
            <input
              type="text"
              value={labRef}
              onChange={(e) => setLabRef(e.target.value)}
              placeholder="Lab reference number (optional)"
              className="mf-input"
            />

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 text-sm"
                style={{ color: "#e05252" }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Upload button */}
            {selectedFile && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="mf-btn-primary w-full py-2.5"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading & notifying patient…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload and Notify
                  </>
                )}
              </button>
            )}

            {/* Cancel replace */}
            {hasResult && (
              <button
                type="button"
                onClick={() => {
                  setShowUploadZone(false);
                  setSelectedFile(null);
                  setError(null);
                }}
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
