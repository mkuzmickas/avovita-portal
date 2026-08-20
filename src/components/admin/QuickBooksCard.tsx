"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface UncategorizedSupplier {
  supplier_name: string;
  count: number;
  total_amount: number;
}

interface Props {
  connected: boolean;
  connectedBy: string | null;
  connectedAt: string | null;
  lastTxnSyncedAt: string | null;
  txnCount: number;
  uncategorizedCount: number;
  uncategorizedSuppliers?: UncategorizedSupplier[];
}

/**
 * Every category the mapper can assign. Keep in sync with the server's
 * VALID_CATEGORIES set in /api/admin/expense-categories/route.ts and
 * the migration seed.
 *
 * `is_cogs: true` categories reduce Gross Profit (direct costs);
 * false = Operating Expenses (below the line).
 */
const CATEGORIES: Array<{
  value: string;
  label: string;
  is_cogs: boolean;
}> = [
  { value: "cogs_lab",       label: "COGS — Lab",       is_cogs: true },
  { value: "cogs_shipping",  label: "COGS — Shipping",  is_cogs: true },
  { value: "cogs_supplies",  label: "COGS — Supplies",  is_cogs: true },
  { value: "contractor",     label: "Contractor (FloLabs, etc.)", is_cogs: true },
  { value: "saas",           label: "SaaS / Software",  is_cogs: false },
  { value: "marketing",      label: "Marketing",        is_cogs: false },
  { value: "regulatory",     label: "Regulatory / Professional", is_cogs: false },
  { value: "bank_fees",      label: "Bank Fees",        is_cogs: false },
  { value: "travel",         label: "Travel",           is_cogs: false },
  { value: "inventory",      label: "Inventory / Resale", is_cogs: false },
  { value: "other",          label: "Other (OpEx)",     is_cogs: false },
];

/**
 * QuickBooks integration card for /admin/financials.
 *
 * States:
 *   - not connected → shows "Connect QuickBooks" (deep-links to
 *     /api/quickbooks/connect which starts the OAuth flow)
 *   - connected → shows who + when + counts, plus "Sync now" and
 *     "Disconnect" buttons
 *
 * Reads the ?qbo= flag left by the callback so we can show a toast
 * on first-connect success/failure.
 */
export function QuickBooksCard({
  connected,
  connectedBy,
  connectedAt,
  lastTxnSyncedAt,
  txnCount,
  uncategorizedCount,
  uncategorizedSuppliers = [],
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const flag = params.get("qbo");

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const runSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/quickbooks/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(`Sync failed: ${data.error ?? "unknown"}`);
      } else {
        setSyncMsg(
          `Synced ${data.purchases + data.bills + data.vendorCredits} txns (${data.categorized} categorized, ${data.uncategorized} unmapped)`,
        );
        router.refresh();
      }
    } catch (err) {
      setSyncMsg(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect QuickBooks? Historical synced data is kept.")) return;
    const res = await fetch("/api/quickbooks/disconnect", { method: "POST" });
    if (res.ok) router.refresh();
  };

  return (
    <div
      style={{
        border: "1px solid #2d6b35",
        borderRadius: 10,
        padding: 20,
        marginBottom: 24,
        backgroundColor: "#0f2614",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: 22,
              color: "#c4973a",
              margin: 0,
            }}
          >
            QuickBooks Online
          </h2>
          <p style={{ color: "#e8d5a3", fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {connected
              ? "Synced automatically each night; click Sync now to pull the last 90 days on demand."
              : "Connect your QBO account to import expenses into the financials view."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!connected && (
            <a
              href="/api/quickbooks/connect"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                backgroundColor: "#c4973a",
                color: "#0a1a0d",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Connect QuickBooks
            </a>
          )}
          {connected && (
            <>
              <button
                type="button"
                onClick={runSync}
                disabled={syncing}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  backgroundColor: syncing ? "#5a705f" : "#c4973a",
                  color: "#0a1a0d",
                  fontSize: 13,
                  fontWeight: 700,
                  border: 0,
                  cursor: syncing ? "not-allowed" : "pointer",
                }}
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <button
                type="button"
                onClick={disconnect}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  backgroundColor: "transparent",
                  color: "#e8d5a3",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "1px solid #2d6b35",
                  cursor: "pointer",
                }}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {connected && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          <Stat label="Connected by" value={connectedBy ?? "—"} />
          <Stat label="Connected at" value={formatDate(connectedAt)} />
          <Stat label="Last sync" value={formatDate(lastTxnSyncedAt)} />
          <Stat label="Transactions synced" value={String(txnCount)} />
          <Stat
            label="Uncategorized"
            value={String(uncategorizedCount)}
            emphasis={uncategorizedCount > 0}
          />
        </div>
      )}

      {connected && uncategorizedSuppliers.length > 0 && (
        <UncategorizedMapper
          suppliers={uncategorizedSuppliers}
          onSaved={() => router.refresh()}
        />
      )}

      {syncMsg && (
        <p style={{ color: "#e8d5a3", fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          {syncMsg}
        </p>
      )}
      {flag === "connected" && (
        <p style={{ color: "#8dc63f", fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          QuickBooks connected — click Sync now to pull your first batch.
        </p>
      )}
      {flag?.startsWith("error:") && (
        <p style={{ color: "#e88b8b", fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          Connection failed: {flag.slice(6)}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          color: "#8dc63f",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: emphasis ? "#c4973a" : "#ffffff",
          fontSize: 16,
          fontWeight: emphasis ? 700 : 500,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  });
}

// ─── Uncategorized supplier mapper ────────────────────────────────────

function UncategorizedMapper({
  suppliers,
  onSaved,
}: {
  suppliers: UncategorizedSupplier[];
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (supplier: string) => {
    const cat = selections[supplier];
    if (!cat) return;
    const meta = CATEGORIES.find((c) => c.value === cat);
    if (!meta) return;
    setSaving(supplier);
    setErrors((e) => ({ ...e, [supplier]: "" }));
    try {
      const res = await fetch("/api/admin/expense-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_pattern: supplier,
          category: cat,
          is_cogs: meta.is_cogs,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((e) => ({
          ...e,
          [supplier]: data.error ?? "Failed to save.",
        }));
      } else {
        onSaved();
      }
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [supplier]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 16,
        borderTop: "1px solid #2d6b35",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: "transparent",
          border: 0,
          color: "#c4973a",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {expanded ? "▾" : "▸"} Map {suppliers.length} uncategorized supplier
        {suppliers.length === 1 ? "" : "s"}
      </button>
      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ color: "#8dc63f", fontSize: 11, marginBottom: 4 }}>
            Uncategorized suppliers fall into the &ldquo;Other (OpEx)&rdquo; bucket by
            default. Pick a real category so future syncs stamp it automatically
            — the change also backfills existing transactions.
          </p>
          {suppliers.map((s) => (
            <div
              key={s.supplier_name}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: 8,
                alignItems: "center",
                padding: "6px 8px",
                borderRadius: 6,
                backgroundColor: "#0a1a0d",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.supplier_name}
                </div>
                <div style={{ color: "#8dc63f", fontSize: 11 }}>
                  {s.count} txn{s.count === 1 ? "" : "s"} · {formatCad(s.total_amount)}
                </div>
              </div>
              <select
                value={selections[s.supplier_name] ?? ""}
                onChange={(e) =>
                  setSelections((prev) => ({
                    ...prev,
                    [s.supplier_name]: e.target.value,
                  }))
                }
                style={{
                  backgroundColor: "#0f2614",
                  border: "1px solid #2d6b35",
                  color: "#e8d5a3",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                }}
              >
                <option value="">— pick category —</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => save(s.supplier_name)}
                disabled={!selections[s.supplier_name] || saving === s.supplier_name}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  backgroundColor:
                    !selections[s.supplier_name] || saving === s.supplier_name
                      ? "#5a705f"
                      : "#c4973a",
                  color: "#0a1a0d",
                  fontSize: 12,
                  fontWeight: 700,
                  border: 0,
                  cursor:
                    !selections[s.supplier_name] || saving === s.supplier_name
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {saving === s.supplier_name ? "…" : "Save"}
              </button>
              <div style={{ minWidth: 0 }}>
                {errors[s.supplier_name] && (
                  <span style={{ color: "#e88b8b", fontSize: 11 }}>
                    {errors[s.supplier_name]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCad(n: number): string {
  return n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
