"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Loader2, Save, CalendarPlus } from "lucide-react";

interface SearchOrder {
  order_id: string;
  patient_name: string;
  patient_dob: string | null;
  appointment_at: string | null;
  created_at: string;
  order_total_cad: number | null;
  status: string;
  test_names: string[];
}

interface AddAppointmentModalProps {
  defaultDate: string; // YYYY-MM-DD (Calgary local)
  onClose: () => void;
}

/**
 * "Add appointment" for last-minute FloLabs collections that weren't
 * booked through Acuity. Search an order (by client name or email),
 * pick date + time, save — the calendar chip appears immediately.
 * Under the hood: PATCH /api/admin/orders/[id]/appointment with
 * appointment_at + appointment_end_at (defaults to +30 min).
 */
export function AddAppointmentModal({
  defaultDate,
  onClose,
}: AddAppointmentModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchOrder[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<SearchOrder | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (picked) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/orders/search?q=${encodeURIComponent(q)}&limit=20`,
        );
        const data = (await res.json()) as { orders?: SearchOrder[] };
        setResults(data.orders ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, picked]);

  async function save() {
    if (!picked) {
      setError("Pick an order first.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Enter a valid date.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError("Enter a valid time.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const at = new Date(calgaryLocalISO(date, time));
      const end = new Date(at.getTime() + durationMin * 60 * 1000);
      const res = await fetch(
        `/api/admin/orders/${picked.order_id}/appointment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointment_at: at.toISOString(),
            appointment_end_at: end.toISOString(),
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Save failed (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center justify-between p-5 border-b"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <h2
            className="font-heading text-xl font-semibold flex items-center gap-2"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <CalendarPlus className="w-5 h-5" style={{ color: "#c4973a" }} />
            Add <span style={{ color: "#c4973a" }}>appointment</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ color: "#e8d5a3" }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs" style={{ color: "#6ab04c" }}>
            Use this for last-minute collections that weren&apos;t booked
            through the FloLabs Acuity link. Search a paid order by patient
            or email, pick when the collection happened, and it lands on
            the calendar immediately. Order status auto-bumps
            confirmed→scheduled.
          </p>

          {!picked ? (
            <div>
              <label
                className="block text-xs mb-1 uppercase tracking-wider"
                style={{ color: "#6ab04c" }}
              >
                Find order
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "#6ab04c" }}
                />
                <input
                  type="text"
                  value={query}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Client name or email…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
                  style={{
                    backgroundColor: "#0f2614",
                    borderColor: "#2d6b35",
                    color: "#ffffff",
                  }}
                />
              </div>
              {searching && (
                <p className="text-xs mt-2" style={{ color: "#6ab04c" }}>
                  Searching…
                </p>
              )}
              {results.length > 0 && (
                <ul className="mt-3 space-y-1.5 max-h-80 overflow-y-auto">
                  {results.map((r) => (
                    <li key={r.order_id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicked(r);
                          if (r.appointment_at) {
                            const dt = new Date(r.appointment_at);
                            const iso = calgaryLocalParts(dt);
                            setDate(iso.date);
                            setTime(iso.time);
                          }
                        }}
                        className="w-full text-left rounded-lg border px-3 py-2 text-sm hover:opacity-90 transition-opacity"
                        style={{
                          backgroundColor: "#0f2614",
                          borderColor: "#2d6b35",
                          color: "#ffffff",
                        }}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">
                            {r.patient_name}
                          </span>
                          <span
                            className="text-[10px] font-mono uppercase"
                            style={{ color: "#c4973a" }}
                          >
                            {r.order_id.slice(0, 8)} · {r.status}
                          </span>
                        </div>
                        <div
                          className="text-xs mt-0.5"
                          style={{ color: "#e8d5a3" }}
                        >
                          {r.test_names.length > 0
                            ? r.test_names.slice(0, 3).join(", ") +
                              (r.test_names.length > 3
                                ? ` +${r.test_names.length - 3}`
                                : "")
                            : "(no tests)"}
                        </div>
                        {r.appointment_at && (
                          <div
                            className="text-[10px] mt-0.5"
                            style={{ color: "#c4973a" }}
                          >
                            Already scheduled — saving will overwrite
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim().length >= 2 &&
                !searching &&
                results.length === 0 && (
                  <p className="text-xs mt-2" style={{ color: "#e8d5a3" }}>
                    No orders match. Try a different name or email
                    fragment.
                  </p>
                )}
            </div>
          ) : (
            <div>
              <div
                className="rounded-lg border p-3 mb-4"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: "#c4973a",
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="font-semibold text-sm"
                    style={{ color: "#ffffff" }}
                  >
                    {picked.patient_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(null);
                      setResults([]);
                    }}
                    className="text-[10px] underline"
                    style={{ color: "#6ab04c" }}
                  >
                    change
                  </button>
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "#e8d5a3" }}
                >
                  {picked.test_names.join(", ") || "(no tests)"}
                </div>
                <div
                  className="text-[10px] mt-1 font-mono uppercase"
                  style={{ color: "#c4973a" }}
                >
                  {picked.order_id.slice(0, 8)} · {picked.status}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label>
                  <span
                    className="block text-xs mb-1 uppercase tracking-wider"
                    style={{ color: "#6ab04c" }}
                  >
                    Date
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{
                      backgroundColor: "#0f2614",
                      borderColor: "#2d6b35",
                      color: "#ffffff",
                      colorScheme: "dark",
                    }}
                  />
                </label>
                <label>
                  <span
                    className="block text-xs mb-1 uppercase tracking-wider"
                    style={{ color: "#6ab04c" }}
                  >
                    Time (Calgary)
                  </span>
                  <input
                    type="time"
                    value={time}
                    step={300}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{
                      backgroundColor: "#0f2614",
                      borderColor: "#2d6b35",
                      color: "#ffffff",
                      colorScheme: "dark",
                    }}
                  />
                </label>
                <label>
                  <span
                    className="block text-xs mb-1 uppercase tracking-wider"
                    style={{ color: "#6ab04c" }}
                  >
                    Duration (min)
                  </span>
                  <select
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{
                      backgroundColor: "#0f2614",
                      borderColor: "#2d6b35",
                      color: "#ffffff",
                    }}
                  >
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                    <option value={45}>45</option>
                    <option value={60}>60</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: "rgba(220,90,90,0.15)",
                borderColor: "#dc5a5a",
                color: "#ffb0b0",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{
              backgroundColor: "#0f2614",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !picked}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              backgroundColor: !picked ? "#5a705f" : "#c4973a",
              color: "#0a1a0d",
              border: 0,
              cursor: saving || !picked ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save appointment
          </button>
        </div>
      </div>
    </div>
  );
}

/** Return an ISO string with the correct Calgary offset for the given
 *  local date + HH:MM — Intl handles DST per-date. */
function calgaryLocalISO(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-06:00";
  const offset = raw.startsWith("GMT") ? raw.slice(3) : "-06:00";
  return `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${offset}`;
}

function calgaryLocalParts(d: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const da = parts.find((p) => p.type === "day")?.value ?? "01";
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return { date: `${y}-${mo}-${da}`, time: `${hh}:${mm}` };
}
