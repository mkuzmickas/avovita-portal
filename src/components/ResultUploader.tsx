"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface ResultUploaderProps {
  orderLineId: string;
  profileId: string;
  testName: string;
  patientName: string;
  onSuccess?: (resultId: string) => void;
}

type UploadState = "idle" | "dragging" | "uploading" | "success" | "error";

export function ResultUploader({
  orderLineId,
  profileId,
  patientName,
  onSuccess,
}: ResultUploaderProps) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [labReference, setLabReference] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      setErrorMessage("Only PDF files are accepted.");
      setUploadState("error");
      return;
    }
    setSelectedFile(file);
    setUploadState("idle");
    setErrorMessage(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setUploadState("idle");
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setUploadState("dragging");
  };

  const handleDragLeave = () => {
    setUploadState("idle");
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadState("uploading");
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("order_line_id", orderLineId);
    formData.append("profile_id", profileId);
    if (labReference.trim()) {
      formData.append("lab_reference_number", labReference.trim());
    }
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/results/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Upload failed");
      }

      const data = await response.json();
      setUploadState("success");
      onSuccess?.(data.result_id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
      setUploadState("error");
    }
  };

  if (uploadState === "success") {
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-xl border"
        style={{
          backgroundColor: "rgba(141, 198, 63, 0.125)",
          borderColor: "#8dc63f",
        }}
      >
        <CheckCircle
          className="w-5 h-5 shrink-0"
          style={{ color: "#8dc63f" }}
        />
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "#ffffff" }}
          >
            Result uploaded successfully
          </p>
          <p className="text-xs" style={{ color: "#8dc63f" }}>
            Patient has been notified by email and SMS.
          </p>
        </div>
      </div>
    );
  }

  const dropZoneStyle: React.CSSProperties =
    uploadState === "dragging"
      ? {
          borderColor: "#c4973a",
          backgroundColor: "#1f4a28",
        }
      : selectedFile
      ? {
          borderColor: "#8dc63f",
          backgroundColor: "#1a3d22",
        }
      : {
          borderColor: "#2d6b35",
          backgroundColor: "#0f2614",
        };

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors"
        style={dropZoneStyle}
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
            <span
              className="text-sm font-medium truncate max-w-xs"
              style={{ color: "#ffffff" }}
            >
              {selectedFile.name}
            </span>
          </div>
        ) : (
          <div>
            <Upload
              className="w-8 h-8 mx-auto mb-2"
              style={{ color: "#6ab04c" }}
            />
            <p className="text-sm" style={{ color: "#e8d5a3" }}>
              <span className="font-semibold" style={{ color: "#c4973a" }}>
                Click to upload
              </span>{" "}
              or drag and drop
            </p>
            <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
              PDF only
            </p>
          </div>
        )}
      </div>

      <input
        type="text"
        value={labReference}
        onChange={(e) => setLabReference(e.target.value)}
        placeholder="Lab reference number (optional)"
        className="mf-input"
      />

      {uploadState === "error" && errorMessage && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "#e05252" }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {selectedFile &&
        (uploadState === "idle" ||
          uploadState === "error" ||
          uploadState === "uploading") && (
          <button
            onClick={handleUpload}
            disabled={uploadState === "uploading"}
            className="mf-btn-primary w-full py-2.5"
          >
            {uploadState === "uploading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading & notifying patient…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload Result for {patientName}
              </>
            )}
          </button>
        )}
    </div>
  );
}
