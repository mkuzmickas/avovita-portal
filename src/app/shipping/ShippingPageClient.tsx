"use client";

import { useState } from "react";
import { SHIPPING_PROFILES } from "@/lib/config/shipping-profiles";

interface Shipment {
  id: string;
  profile_kind: string;
  tracking_number: string;
  service_type: string | null;
  label_url: string | null;
  weight_lb: number | null;
  notes: string | null;
  environment: string;
  shipped_by_name: string | null;
  created_at: string;
}

interface Props {
  token: string;
  recentShipments: Shipment[];
}

/**
 * Standalone shipping console for FloLabs. Simple layout:
 *   - Prominent shipping buttons (one per profile)
 *   - Optional "your name" + "notes" inputs so the audit trail has
 *     attribution when multiple people share the URL
 *   - Recent shipments table so a shipper can see what they and
 *     others sent today, download labels, get tracking numbers
 *
 * Kept intentionally spare — this is a shipping tool, not a
 * marketing page. No AvoVita header/footer, no auth chrome, no
 * navigation. Fits a warehouse laptop and a phone.
 */
export function ShippingPageClient({ token, recentShipments }: Props) {
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    trackingNumber: string;
    labelUrl: string | null;
    environment: string;
  } | null>(null);
  const [shipperName, setShipperName] = useState("");
  const [notes, setNotes] = useState("");
  const [shipments, setShipments] = useState(recentShipments);

  const handleShip = async (kind: string) => {
    if (busyKind) return;
    setBusyKind(kind);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/shipping/create-label", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shipping-token": token,
        },
        body: JSON.stringify({
          kind,
          notes: notes.trim() || undefined,
          shipped_by_name: shipperName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Shipping failed.");
        return;
      }
      setLastResult({
        trackingNumber: data.tracking_number,
        labelUrl: data.label_url,
        environment: data.environment,
      });
      setNotes("");
      // Optimistically prepend to shipments list; full accuracy comes
      // on next page refresh.
      setShipments((prev) =>
        [
          {
            id: data.shipment_id ?? crypto.randomUUID(),
            profile_kind: kind,
            tracking_number: data.tracking_number,
            service_type: SHIPPING_PROFILES[kind]?.serviceType ?? null,
            label_url: data.label_url,
            weight_lb: SHIPPING_PROFILES[kind]?.package.weightLb ?? null,
            notes: notes.trim() || null,
            environment: data.environment,
            shipped_by_name: shipperName.trim() || null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 20),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shipping failed.");
    } finally {
      setBusyKind(null);
    }
  };

  const profiles = Object.values(SHIPPING_PROFILES);
  const isSandbox = shipments.some((s) => s.environment === "sandbox");

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a1a0d",
        color: "#e8d5a3",
        padding: "32px 20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <header style={{ marginBottom: "32px" }}>
          <h1
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: "36px",
              color: "#ffffff",
              margin: "0 0 8px 0",
            }}
          >
            AvoVita <span style={{ color: "#c4973a" }}>Shipping</span>
          </h1>
          <p style={{ color: "#6ab04c", fontSize: "14px", margin: 0 }}>
            FedEx label creation for scheduled specimen pickups.
            {isSandbox && (
              <span style={{ color: "#c4973a", marginLeft: "8px" }}>
                · Sandbox mode — no real shipments are being created.
              </span>
            )}
          </p>
        </header>

        {/* Shipper attribution — optional but recommended */}
        <section style={{ marginBottom: "24px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: "12px",
              backgroundColor: "#1a3d22",
              border: "1px solid #2d6b35",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  marginBottom: "6px",
                  color: "#c4973a",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                }}
              >
                Your name
              </label>
              <input
                type="text"
                value={shipperName}
                onChange={(e) => setShipperName(e.target.value)}
                placeholder="e.g. Sarah"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  marginBottom: "6px",
                  color: "#c4973a",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                }}
              >
                Notes (optional, shown on airway bill reference)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Wilson + Jarvis specimens"
                maxLength={40}
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns:
              profiles.length === 1 ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
            marginBottom: "32px",
          }}
        >
          {profiles.map((profile) => (
            <button
              key={profile.kind}
              type="button"
              onClick={() => handleShip(profile.kind)}
              disabled={busyKind !== null}
              style={{
                backgroundColor: busyKind === profile.kind ? "#8b6a1e" : "#c4973a",
                color: "#0a1a0d",
                border: 0,
                borderRadius: "12px",
                padding: "24px 20px",
                fontSize: "18px",
                fontWeight: 700,
                cursor: busyKind ? "not-allowed" : "pointer",
                opacity: busyKind && busyKind !== profile.kind ? 0.4 : 1,
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>
                {busyKind === profile.kind ? "Creating label…" : profile.displayLabel}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 400,
                  opacity: 0.8,
                  lineHeight: 1.4,
                }}
              >
                {profile.displaySubtitle}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  marginTop: "10px",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  opacity: 0.7,
                }}
              >
                → {profile.recipient.company} · {profile.package.weightLb} lb
                {profile.package.dryIceWeightKg > 0
                  ? ` · ${profile.package.dryIceWeightKg} kg dry ice`
                  : ""}
              </div>
            </button>
          ))}
        </section>

        {/* Error / success feedback */}
        {error && (
          <div
            style={{
              marginBottom: "24px",
              padding: "14px 16px",
              backgroundColor: "rgba(224,82,82,0.12)",
              border: "1px solid #e05252",
              borderRadius: "8px",
              color: "#e05252",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            <strong>Shipping failed:</strong> {error}
          </div>
        )}

        {lastResult && (
          <div
            style={{
              marginBottom: "24px",
              padding: "16px 18px",
              backgroundColor: "rgba(141,198,63,0.1)",
              border: "1px solid #8dc63f",
              borderRadius: "10px",
              color: "#8dc63f",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
              Label created — tracking {lastResult.trackingNumber}
              {lastResult.environment === "sandbox" && (
                <span
                  style={{
                    marginLeft: "8px",
                    color: "#c4973a",
                    fontSize: "12px",
                  }}
                >
                  (sandbox — not a real label)
                </span>
              )}
            </div>
            {lastResult.labelUrl && (
              <div>
                <a
                  href={lastResult.labelUrl}
                  target="_blank"
                  rel="noopener"
                  style={{
                    color: "#c4973a",
                    fontWeight: 700,
                    textDecoration: "underline",
                  }}
                >
                  Open label PDF →
                </a>
              </div>
            )}
          </div>
        )}

        {/* Recent shipments */}
        {shipments.length > 0 && (
          <section>
            <h2
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: "20px",
                color: "#ffffff",
                marginBottom: "12px",
              }}
            >
              Recent Shipments
            </h2>
            <div
              style={{
                border: "1px solid #2d6b35",
                borderRadius: "10px",
                overflow: "hidden",
                fontSize: "13px",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#0f2614" }}>
                    <th style={thStyle}>When</th>
                    <th style={thStyle}>Kind</th>
                    <th style={thStyle}>Tracking</th>
                    <th style={thStyle}>By</th>
                    <th style={thStyle}>Notes</th>
                    <th style={thStyle}>Label</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr
                      key={s.id}
                      style={{ borderTop: "1px solid #2d6b35" }}
                    >
                      <td style={tdStyle}>
                        {new Date(s.created_at).toLocaleString("en-CA", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: "#ffffff" }}>{s.profile_kind}</span>
                        {s.environment === "sandbox" && (
                          <span
                            style={{
                              marginLeft: "6px",
                              fontSize: "10px",
                              color: "#c4973a",
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                            }}
                          >
                            sandbox
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {s.tracking_number}
                      </td>
                      <td style={tdStyle}>{s.shipped_by_name ?? "—"}</td>
                      <td style={tdStyle}>{s.notes ?? ""}</td>
                      <td style={tdStyle}>
                        {s.label_url ? (
                          <a
                            href={s.label_url}
                            target="_blank"
                            rel="noopener"
                            style={{ color: "#c4973a", fontWeight: 600 }}
                          >
                            Open
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #2d6b35",
  borderRadius: "8px",
  backgroundColor: "#0f2614",
  color: "#ffffff",
  fontSize: "14px",
  fontFamily: "inherit",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  color: "#c4973a",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontWeight: 700,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  color: "#e8d5a3",
  verticalAlign: "top",
};
