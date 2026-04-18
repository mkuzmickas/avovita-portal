"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Plus, Loader2, Download, Lock, Unlock, ExternalLink, AlertCircle } from "lucide-react";
import type { ManifestWithCount } from "@/app/(admin)/admin/manifests/page";

interface ManifestsManagerProps {
  initialManifests: ManifestWithCount[];
}

function nextTuesdayISO(): string {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 2=Tue
  const offset = (2 - day + 7) % 7 || 7; // always future Tuesday
  const tue = new Date(today);
  tue.setDate(today.getDate() + offset);
  const y = tue.getFullYear();
  const m = String(tue.getMonth() + 1).padStart(2, "0");
  const d = String(tue.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ManifestsManager({ initialManifests }: ManifestsManagerProps) {
  const router = useRouter();
  const [manifests, setManifests] = useState<ManifestWithCount[]>(initialManifests);
  const [tab, setTab] = useState<"open" | "closed">("open");

  // Keep local state in sync when the server component re-fetches after
  // router.refresh(). Without this, useState's initial value sticks and
  // newly-created manifests never appear in the list.
  useEffect(() => {
    setManifests(initialManifests);
  }, [initialManifests]);

  // Create form state
  const defaultDate = useMemo(() => nextTuesdayISO(), []);
  const [shipDate, setShipDate] = useState<string>(defaultDate);
  const [name, setName] = useState<string>(`Shipment — ${formatDateLong(defaultDate)}`);
  const [nameDirty, setNameDirty] = useState(false);
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill name when ship date changes (until user edits the name)
  useEffect(() => {
    if (!nameDirty && shipDate) {
      setName(`Shipment — ${formatDateLong(shipDate)}`);
    }
  }, [shipDate, nameDirty]);

  const filtered = manifests.filter((m) => m.status === tab);

  const create = async () => {
    setError(null);
    if (!name.trim() || !shipDate) {
      setError("Name and ship date are required");
      return;
    }
    setCreating(true);
    console.log("[manifests:create] submitting", {
      name: name.trim(),
      ship_date: shipDate,
      notes: notes.trim() || null,
    });
    try {
      const res = await fetch("/api/admin/manifests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ship_date: shipDate,
          notes: notes.trim() || null,
        }),
      });
      console.log("[manifests:create] response status", res.status);
      const data = await res.json().catch((e) => {
        console.error("[manifests:create] failed to parse response", e);
        return {} as { error?: string; id?: string };
      });
      console.log("[manifests:create] response body", data);

      if (!res.ok) {
        setError(
          data.error ?? `Failed to create manifest (HTTP ${res.status})`
        );
        return;
      }
      // Reset form first so success is visible even if router.refresh()
      // takes a moment
      const next = nextTuesdayISO();
      setShipDate(next);
      setName(`Shipment — ${formatDateLong(next)}`);
      setNameDirty(false);
      setNotes("");
      router.refresh();
    } catch (err) {
      console.error("[manifests:create] network error", err);
      setError(
        err instanceof Error
          ? `Network error: ${err.message}`
          : "Network error. Please try again."
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (
    id: string,
    nextStatus: "open" | "closed"
  ) => {
    const res = await fetch(`/api/admin/manifests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed: ${data.error ?? res.statusText}`);
      return;
    }
    setManifests((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: nextStatus } : m))
    );
  };

  return (
    <div className="space-y-8">
      {/* Create form */}
      <section
        className="rounded-xl border p-5 space-y-3"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h2
          className="font-heading text-xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          New Manifest
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Ship Date" required helper="Ship dates are typically Tuesdays">
            <input
              type="date"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              className="mf-input"
            />
          </Field>
          <Field label="Manifest Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setNameDirty(true);
                setName(e.target.value);
              }}
              className="mf-input"
            />
          </Field>
          <Field label="Notes (optional)">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mf-input"
            />
          </Field>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg text-sm border"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.12)",
              borderColor: "#e05252",
              color: "#e05252",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={create}
          disabled={creating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{
            backgroundColor: "#c4973a",
            color: "#0a1a0d",
            opacity: creating ? 0.6 : 1,
          }}
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {creating ? "Creating…" : "Create Manifest"}
        </button>
      </section>

      {/* Tabs */}
      <div
        className="flex items-center gap-2 border-b"
        style={{ borderColor: "#2d6b35" }}
      >
        {(["open", "closed"] as const).map((key) => {
          const active = tab === key;
          const count = manifests.filter((m) => m.status === key).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="px-4 py-2.5 text-sm font-semibold transition-colors"
              style={{
                color: active ? "#c4973a" : "#e8d5a3",
                borderBottom: active ? "2px solid #c4973a" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {key === "open" ? "Open" : "Closed"} ({count})
            </button>
          );
        })}
      </div>

      {/* Manifest cards */}
      {filtered.length === 0 ? (
        <div
          className="rounded-xl border px-6 py-12 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <p style={{ color: "#6ab04c" }}>
            {tab === "open"
              ? "No open manifests. Create one above to start grouping orders."
              : "No closed manifests yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <ManifestCard
              key={m.id}
              manifest={m}
              onToggle={() => toggleStatus(m.id, m.status === "open" ? "closed" : "open")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ManifestCard({
  manifest,
  onToggle,
}: {
  manifest: ManifestWithCount;
  onToggle: () => void;
}) {
  const isOpen = manifest.status === "open";
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3"
      style={{
        backgroundColor: "#1a3d22",
        borderColor: isOpen ? "#2d6b35" : "#c4973a",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="font-heading text-lg font-semibold leading-tight"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            {manifest.name}
          </h3>
          <p className="mt-1 text-xs flex items-center gap-1.5" style={{ color: "#e8d5a3" }}>
            <Calendar className="w-3.5 h-3.5" style={{ color: "#c4973a" }} />
            Ship: {formatDateLong(manifest.ship_date)}
          </p>
        </div>
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0"
          style={
            isOpen
              ? {
                  backgroundColor: "rgba(141,198,63,0.125)",
                  color: "#8dc63f",
                  borderColor: "#8dc63f",
                }
              : {
                  backgroundColor: "rgba(196,151,58,0.125)",
                  color: "#c4973a",
                  borderColor: "#c4973a",
                }
          }
        >
          {isOpen ? "Open" : "Closed"}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs" style={{ color: "#6ab04c" }}>
        <span>{manifest.order_count} order{manifest.order_count === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>Created {formatDateShort(manifest.created_at)}</span>
      </div>

      {manifest.notes && (
        <p className="text-xs italic" style={{ color: "#e8d5a3" }}>
          {manifest.notes}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-auto pt-2">
        <Link
          href={`/admin/manifests/${manifest.id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View
        </Link>
        <a
          href={`/api/admin/manifests/${manifest.id}/export`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
          style={{
            backgroundColor: "transparent",
            borderColor: "#c4973a",
            color: "#c4973a",
          }}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </a>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
          style={{
            backgroundColor: "transparent",
            borderColor: "#2d6b35",
            color: "#e8d5a3",
          }}
        >
          {isOpen ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          {isOpen ? "Close Manifest" : "Reopen"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "#e8d5a3" }}
      >
        {label}
        {required && <span style={{ color: "#e05252" }}> *</span>}
      </label>
      {children}
      {helper && (
        <p className="mt-1 text-xs" style={{ color: "#6ab04c" }}>
          {helper}
        </p>
      )}
    </div>
  );
}
