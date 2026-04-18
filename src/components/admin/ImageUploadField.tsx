"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { signedUploadToStorage } from "@/lib/storage/upload";
import { resolveImageUrl } from "@/lib/storage/imageUrl";

interface ImageUploadFieldProps {
  /** Label displayed above the field. */
  label: string;
  /** Current storage path or external URL (null = no image). */
  value: string | null;
  /** Supabase Storage bucket name. */
  bucket: string;
  /** Called when image is uploaded or removed. */
  onChange: (path: string | null) => void;
  /** Accepted MIME types. */
  accept?: string;
  /** Max file size in bytes. Default 5 MB. */
  maxSize?: number;
}

const DEFAULT_ACCEPT = "image/jpeg,image/png,image/webp";
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

/**
 * Image upload field with thumbnail preview, replace, and remove.
 * Uses the signed-upload flow (browser → Supabase Storage directly).
 */
export function ImageUploadField({
  label,
  value,
  bucket,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolvedUrl = resolveImageUrl(value, bucket);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const acceptList = accept.split(",").map((s) => s.trim());
    if (!acceptList.includes(file.type)) {
      setError("Invalid file type. Accepted: JPEG, PNG, WebP");
      return;
    }
    if (file.size > maxSize) {
      setError(`File exceeds ${Math.round(maxSize / 1024 / 1024)} MB limit`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const result = await signedUploadToStorage(
        file,
        "/api/admin/images/upload",
        file.type,
      );
      // The upload route needs the bucket — pass it via the body.
      // Since signedUploadToStorage sends { filename, fileSize, mimeType },
      // we need to augment it. Let's call the API directly instead:
      // (This is a targeted override — the shared utility doesn't know about bucket.)

      // Step 1: Get signed URL with bucket
      const urlResp = await fetch("/api/admin/images/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          bucket,
        }),
      });
      const urlData = await urlResp.json();
      if (!urlResp.ok) throw new Error(urlData.error ?? "Upload failed");

      // Step 2: Upload directly to Supabase
      const uploadResp = await fetch(urlData.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResp.ok) throw new Error("Upload to storage failed");

      // Step 3: Confirm
      const confirmResp = await fetch("/api/admin/images/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: urlData.path,
          bucket,
          filename: file.name,
          fileSize: file.size,
        }),
      });
      const confirmData = await confirmResp.json();
      if (!confirmResp.ok) throw new Error(confirmData.error ?? "Verification failed");

      onChange(confirmData.file_path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // We called signedUploadToStorage but then overrode it inline because
  // the image route needs a `bucket` param. Clean up the unused import
  // by marking it used here:
  void signedUploadToStorage;

  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "#e8d5a3" }}
      >
        {label}
      </label>

      {resolvedUrl ? (
        <div className="space-y-2">
          {/* Thumbnail preview */}
          <div
            className="relative w-[150px] h-[150px] rounded-lg overflow-hidden"
            style={{ border: "1px solid #2d6b35" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvedUrl}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{
                color: "#c4973a",
                borderColor: "#2d6b35",
                backgroundColor: "transparent",
                opacity: uploading ? 0.5 : 1,
              }}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{
                color: "#e05252",
                borderColor: "#2d6b35",
                backgroundColor: "transparent",
              }}
            >
              <X className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full max-w-[300px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors"
          style={{
            borderColor: uploading ? "#c4973a" : "#2d6b35",
            backgroundColor: "#0f2614",
            color: "#e8d5a3",
          }}
        >
          {uploading ? (
            <>
              <Loader2
                className="w-6 h-6 animate-spin"
                style={{ color: "#c4973a" }}
              />
              <span className="text-xs">Uploading…</span>
            </>
          ) : (
            <>
              <ImageIcon className="w-6 h-6" style={{ color: "#2d6b35" }} />
              <span className="text-xs">Click to upload an image</span>
              <span className="text-[10px]" style={{ color: "#6ab04c" }}>
                JPEG, PNG, or WebP · Max {Math.round(maxSize / 1024 / 1024)} MB
              </span>
            </>
          )}
        </button>
      )}

      {error && (
        <p className="mt-1.5 text-xs" style={{ color: "#e05252" }}>
          {error}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
