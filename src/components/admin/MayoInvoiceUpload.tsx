"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * File-picker + drop-zone that reads a JSON invoice from disk and
 * POSTs it to /api/admin/mayo/invoices. PDF parsing is a v2 problem;
 * for now Mike (or Claude) hand-extracts each invoice into JSON with
 * the shape documented in the API route.
 */
export function MayoInvoiceUpload() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    setMsg(null);
    setIsError(false);
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("File is not valid JSON.");
      }
      const payload =
        typeof json === "object" && json !== null && "source_filename" in json
          ? json
          : { ...(json as object), source_filename: file.name };
      const res = await fetch("/api/admin/mayo/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMsg(
        `Uploaded — ${data.lines_upserted} lines, ${data.auto_matched} auto-matched, ${data.unmatched} need review.`,
      );
      router.refresh();
    } catch (err) {
      setIsError(true);
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div
      style={{
        border: "1px dashed #2d6b35",
        borderRadius: 10,
        padding: 20,
        backgroundColor: "#0f2614",
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: 20,
              color: "#c4973a",
              margin: 0,
            }}
          >
            Upload invoice (JSON)
          </h2>
          <p
            style={{
              color: "#e8d5a3",
              fontSize: 12,
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Drop a JSON file matching the invoice schema. Re-uploading the
            same invoice_number is idempotent — new lines add, existing
            matches survive.
          </p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              backgroundColor: busy ? "#5a705f" : "#c4973a",
              color: "#0a1a0d",
              fontSize: 13,
              fontWeight: 700,
              border: 0,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Uploading…" : "Choose JSON file"}
          </button>
        </div>
      </div>
      {msg && (
        <p
          style={{
            marginTop: 12,
            marginBottom: 0,
            fontSize: 12,
            color: isError ? "#e88b8b" : "#8dc63f",
          }}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
