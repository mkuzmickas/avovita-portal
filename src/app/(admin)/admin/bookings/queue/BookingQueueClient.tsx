"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { QueuedEvent } from "./page";

interface Props {
  events: QueuedEvent[];
}

export function BookingQueueClient({ events: initialEvents }: Props) {
  const [events, setEvents] = useState(initialEvents);

  if (events.length === 0) {
    return (
      <div
        style={{
          padding: "40px",
          border: "1px dashed #2d6b35",
          borderRadius: "10px",
          color: "#e8d5a3",
          textAlign: "center",
        }}
      >
        Nothing in the queue. All forwarded FloLabs confirmations have
        auto-matched to an order.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {events.map((ev) => (
        <QueueRow
          key={ev.id}
          event={ev}
          onResolved={(id) => setEvents((prev) => prev.filter((e) => e.id !== id))}
        />
      ))}
    </div>
  );
}

function QueueRow({
  event,
  onResolved,
}: {
  event: QueuedEvent;
  onResolved: (id: string) => void;
}) {
  const router = useRouter();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    event.candidate_snapshot?.[0]?.orderId ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = event.candidate_snapshot ?? [];

  const assign = async () => {
    if (!selectedOrderId || !event.parsed_appointment_at) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrderId,
          appointmentAtISO: event.parsed_appointment_at,
          durationMinutes: 30,
          bookingEventId: event.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Assign failed.");
        return;
      }
      onResolved(event.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed.");
    } finally {
      setBusy(false);
    }
  };

  const rematch = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingEventId: event.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Re-match failed.");
        return;
      }
      // Simple approach: reload the page so the fresh candidates render.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-match failed.");
    } finally {
      setBusy(false);
    }
  };

  const ignore = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingEventId: event.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Ignore failed.");
        return;
      }
      onResolved(event.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ignore failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid #2d6b35",
        borderRadius: "10px",
        backgroundColor: "#0f2614",
        padding: "16px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: "20px",
        }}
      >
        {/* LEFT: parsed fields */}
        <div>
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
            {event.resolution === "no_match" ? "No match" : "Needs review"} —{" "}
            {new Date(event.received_at).toLocaleString("en-CA", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
          <ParsedRow label="Client" value={event.parsed_client_name} />
          <ParsedRow label="Email" value={event.parsed_client_email} />
          <ParsedRow label="Phone" value={event.parsed_client_phone} />
          <ParsedRow label="Address" value={event.parsed_address} />
          <ParsedRow
            label="Appointment"
            value={
              event.parsed_appointment_at
                ? formatLocal(event.parsed_appointment_at)
                : null
            }
          />
          {event.parse_warnings.length > 0 && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "#c4973a" }}>
              ⚠ {event.parse_warnings.join(" ")}
            </div>
          )}
        </div>

        {/* RIGHT: candidate picker */}
        <div>
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
          {candidates.length === 0 ? (
            <div
              style={{
                padding: "12px",
                border: "1px dashed #2d6b35",
                borderRadius: "8px",
                color: "#e8d5a3",
                fontSize: "13px",
              }}
            >
              No matching unscheduled orders in the portal. The client may not
              have paid yet, or the order is already scheduled. Ignore this
              event to clear it from the queue.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {candidates.map((c) => {
                const isSel = c.orderId === selectedOrderId;
                return (
                  <button
                    key={c.orderId}
                    type="button"
                    onClick={() => setSelectedOrderId(c.orderId)}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      border: `1px solid ${isSel ? "#c4973a" : "#2d6b35"}`,
                      borderRadius: "8px",
                      backgroundColor: isSel ? "#1f4a28" : "transparent",
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
                      <div style={{ fontWeight: 600, fontSize: "13px" }}>
                        {c.patientNames.join(", ") ||
                          c.accountName ||
                          c.accountEmail ||
                          "Unknown"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#8dc63f" }}>
                        {c.matchedBy.join(", ")}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        opacity: 0.75,
                        marginTop: "3px",
                      }}
                    >
                      {c.tests.slice(0, 4).join(" · ")}
                      {c.tests.length > 4 && ` +${c.tests.length - 4}`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
            {candidates.length > 0 && (
              <button
                type="button"
                onClick={assign}
                disabled={!selectedOrderId || busy}
                style={{
                  padding: "8px 14px",
                  border: 0,
                  borderRadius: "8px",
                  backgroundColor: !selectedOrderId ? "#3a4a3f" : "#8dc63f",
                  color: "#0a1a0d",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: !selectedOrderId || busy ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Assign
              </button>
            )}
            <button
              type="button"
              onClick={rematch}
              disabled={busy}
              style={{
                padding: "8px 14px",
                border: "1px solid #c4973a",
                borderRadius: "8px",
                backgroundColor: "transparent",
                color: "#c4973a",
                fontSize: "13px",
                cursor: busy ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Re-match
            </button>
            <button
              type="button"
              onClick={ignore}
              disabled={busy}
              style={{
                padding: "8px 14px",
                border: "1px solid #2d6b35",
                borderRadius: "8px",
                backgroundColor: "transparent",
                color: "#e8d5a3",
                fontSize: "13px",
                cursor: busy ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Ignore
            </button>
          </div>
          {error && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px 12px",
                border: "1px solid #e05252",
                borderRadius: "8px",
                backgroundColor: "rgba(224,82,82,0.12)",
                color: "#e05252",
                fontSize: "12px",
                display: "flex",
                gap: "6px",
                alignItems: "center",
              }}
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>
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
        gap: "10px",
        padding: "3px 0",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "#8ba392", minWidth: "90px" }}>{label}</span>
      <span
        style={{
          color: value ? "#ffffff" : "#e05252",
          fontWeight: value ? 500 : 400,
        }}
      >
        {value ?? "(missing)"}
      </span>
    </div>
  );
}

function formatLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
