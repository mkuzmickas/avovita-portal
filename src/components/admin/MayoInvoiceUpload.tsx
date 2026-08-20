"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Upload zone for Mayo invoices. Accepts PDF (preferred — server
 * parses via pdf-parse) or JSON (fallback for weird formats). File
 * type is detected by extension and routed to the matching endpoint.
 *
 * Supports click-to-pick and full drag-and-drop of the file onto
 * the zone.
 */
export function MayoInvoiceUpload() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    setMsg(null);
    setIsError(false);
    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      const isJson = file.name.toLowerCase().endsWith(".json");
      if (!isPdf && !isJson) {
        throw new Error("File must be .pdf or .json.");
      }

      let res: Response;
      if (isPdf) {
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/admin/mayo/invoices/upload-pdf", {
          method: "POST",
          body: form,
        });
      } else {
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
        res = await fetch("/api/admin/mayo/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const driftMsg =
        typeof data.drift_cad === "number" && Math.abs(data.drift_cad) > 1
          ? ` · ⚠ drift ${data.drift_cad.toFixed(2)} vs Grand Total`
          : "";
      setMsg(
        `Uploaded ${data.invoice_number ?? file.name} — ${data.lines_upserted} line${data.lines_upserted === 1 ? "" : "s"}, ${data.auto_matched} auto-matched, ${data.unmatched} need review${driftMsg}.`,
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
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (busy) return;
        const file = e.dataTransfer.files?.[0];
        if (file) upload(file);
      }}
      style={{
        border: `2px dashed ${dragOver ? "#c4973a" : "#2d6b35"}`,
        borderRadius: 10,
        padding: 24,
        backgroundColor: dragOver ? "#1a3d22" : "#0f2614",
        transition: "background-color 120ms, border-color 120ms",
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
            Upload Mayo invoice
          </h2>
          <p
            style={{
              color: "#e8d5a3",
              fontSize: 12,
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Drop a Mayo Clinic Labs invoice <strong>PDF</strong> here (or click
            the button). Server parses the PDF, ingests every line, and
            auto-matches confident hits to portal orders. JSON also accepted
            for edge cases.
          </p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf,application/json,.json"
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
            {busy ? "Uploading…" : "Choose file"}
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
