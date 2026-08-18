"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface ParsedFields {
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  address: string | null;
  appointmentAtISO: string | null;
  rawSubjectLine: string | null;
  warnings: string[];
}

interface Candidate {
  orderId: string;
  totalCad: number | null;
  createdAt: string;
  accountEmail: string | null;
  accountName: string | null;
  patientNames: string[];
  tests: string[];
  matchScore: number;
  matchedBy: string[];
}

export function NewBookingClient() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFields | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const parse = async () => {
    if (!raw.trim()) return;
    setBusy(true);
    setError(null);
    setParsed(null);
    setCandidates([]);
    setSelectedId(null);
    try {
      const res = await fetch("/api/admin/bookings/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawEmail: raw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Parse failed.");
        return;
      }
      setParsed(data.parsed);
      setCandidates(data.candidates ?? []);
      if (data.candidates?.length && data.candidates[0].matchScore >= 100) {
        setSelectedId(data.candidates[0].orderId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed.");
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!selectedId || !parsed?.appointmentAtISO) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedId,
          appointmentAtISO: parsed.appointmentAtISO,
          durationMinutes: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Assign failed.");
        return;
      }
      const dayISO = parsed.appointmentAtISO.slice(0, 10);
      router.push(`/admin/calendar?date=${dayISO}&view=week`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {/* LEFT: paste area */}
      <div>
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: "#c4973a", textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          Paste the full email body
        </label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={18}
          placeholder="Copy the whole confirmation from Outlook (Ctrl+A, Ctrl+C on the message pane) and paste here."
          style={{
            width: "100%",
            padding: "12px",
            border: "1px solid #2d6b35",
            borderRadius: "8px",
            backgroundColor: "#0f2614",
            color: "#e8d5a3",
            fontSize: "12px",
            fontFamily: "ui-monospace, monospace",
            lineHeight: 1.4,
            resize: "vertical",
          }}
        />
        <button
          type="button"
          onClick={parse}
          disabled={busy || !raw.trim()}
          style={{
            marginTop: "12px",
            padding: "10px 16px",
            border: 0,
            borderRadius: "8px",
            backgroundColor: busy ? "#8b6a1e" : "#c4973a",
            color: "#0a1a0d",
            fontSize: "14px",
            fontWeight: 700,
            cursor: busy || !raw.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? "Parsing…" : "Parse email"}
        </button>
        {error && (
          <div
            style={{
              marginTop: "12px",
              padding: "10px 12px",
              border: "1px solid #e05252",
              borderRadius: "8px",
              backgroundColor: "rgba(224,82,82,0.12)",
              color: "#e05252",
              fontSize: "13px",
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* RIGHT: parsed fields + candidates */}
      <div>
        {parsed && (
          <>
            <div
              style={{
                padding: "14px 16px",
                border: "1px solid #2d6b35",
                borderRadius: "10px",
                backgroundColor: "#0f2614",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "#c4973a",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  marginBottom: "8px",
                }}
              >
                Parsed
              </div>
              <ParsedRow label="Client" value={parsed.clientName} />
              <ParsedRow label="Email" value={parsed.clientEmail} />
              <ParsedRow label="Phone" value={parsed.clientPhone} />
              <ParsedRow label="Address" value={parsed.address} />
              <ParsedRow
                label="Appointment"
                value={
                  parsed.appointmentAtISO
                    ? formatLocal(parsed.appointmentAtISO)
                    : null
                }
              />
              {parsed.warnings.length > 0 && (
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "12px",
                    color: "#c4973a",
                  }}
                >
                  ⚠ {parsed.warnings.join(" ")}
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: "11px",
                color: "#c4973a",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 700,
                marginBottom: "8px",
              }}
            >
              Candidate orders ({candidates.length})
            </div>
            {candidates.length === 0 && (
              <div
                style={{
                  padding: "12px",
                  color: "#e8d5a3",
                  fontSize: "13px",
                  border: "1px dashed #2d6b35",
                  borderRadius: "8px",
                }}
              >
                No unscheduled orders matched. Either the client isn't in the
                portal yet or the order is already scheduled.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {candidates.map((c) => {
                const isSelected = selectedId === c.orderId;
                return (
                  <button
                    key={c.orderId}
                    type="button"
                    onClick={() => setSelectedId(c.orderId)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      border: `1px solid ${isSelected ? "#c4973a" : "#2d6b35"}`,
                      borderRadius: "8px",
                      backgroundColor: isSelected ? "#1f4a28" : "#0f2614",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {c.patientNames.join(", ") ||
                          c.accountName ||
                          c.accountEmail ||
                          "Unknown"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#8dc63f" }}>
                        {c.matchScore >= 100 && <>✓ </>}
                        {c.matchedBy.join(", ") || "no match reason"}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        opacity: 0.75,
                        marginTop: "4px",
                      }}
                    >
                      {c.tests.slice(0, 4).join(" · ")}
                      {c.tests.length > 4 && ` +${c.tests.length - 4} more`}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        marginTop: "4px",
                        color: "#c4973a",
                      }}
                    >
                      Order {c.orderId.slice(0, 8).toUpperCase()} ·{" "}
                      {c.totalCad != null ? `$${c.totalCad}` : "—"} ·{" "}
                      {new Date(c.createdAt).toLocaleDateString("en-CA")}
                    </div>
                  </button>
                );
              })}
            </div>

            {parsed.appointmentAtISO && (
              <button
                type="button"
                onClick={assign}
                disabled={!selectedId || assigning}
                style={{
                  marginTop: "16px",
                  padding: "10px 16px",
                  border: 0,
                  borderRadius: "8px",
                  backgroundColor: !selectedId ? "#3a4a3f" : "#8dc63f",
                  color: "#0a1a0d",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: !selectedId || assigning ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {assigning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {assigning ? "Assigning…" : "Confirm & assign"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ParsedRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        padding: "3px 0",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "#8ba392", minWidth: "90px" }}>{label}</span>
      <span style={{ color: value ? "#ffffff" : "#e05252", fontWeight: value ? 500 : 400 }}>
        {value ?? "(missing)"}
      </span>
    </div>
  );
}

function formatLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
