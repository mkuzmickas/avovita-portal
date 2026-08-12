"use client";

import { useState } from "react";
import { SHIPPING_PROFILES } from "@/lib/config/shipping-profiles";
import {
  SAVED_PICKUP_ADDRESSES,
  PICKUP_DEFAULTS,
} from "@/lib/config/pickup";

interface Shipment {
  id: string;
  profile_kind: string;
  tracking_number: string;
  service_type: string | null;
  label_url: string | null;
  weight_lb: number | null;
  environment: string;
  created_at: string;
}

interface Props {
  token: string;
  recentShipments: Shipment[];
}

/**
 * Standalone shipping console for FloLabs. Simple layout:
 *   - Prominent shipping buttons (one per profile)
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
    labelCopies: number;
    environment: string;
    fedexGeneratedDocs: Array<{
      contentType: string;
      fileName: string;
      url: string;
      copiesToPrint: number;
    }>;
    customsDocs: Array<{ fileName: string; url: string }>;
  } | null>(null);
  const [shipments, setShipments] = useState(recentShipments);

  // ─── Pickup booking state ───────────────────────────────────
  const todayCalgaryISO = () => {
    // YYYY-MM-DD in Calgary local time, robust across DST.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Edmonton",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${d}`;
  };
  const [pickupBusy, setPickupBusy] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [pickupResult, setPickupResult] = useState<{
    confirmationCode: string;
    scheduledDate: string;
    readyTime: string;
    closeTime: string;
    addressLabel: string;
    environment: string;
  } | null>(null);
  const [pickupDate, setPickupDate] = useState<string>(todayCalgaryISO());
  const [pickupAddressKey, setPickupAddressKey] = useState<string>(
    SAVED_PICKUP_ADDRESSES[0]?.key ?? "",
  );
  const [pickupReadyTime, setPickupReadyTime] = useState<string>(
    PICKUP_DEFAULTS.readyTime,
  );
  const [pickupCloseTime, setPickupCloseTime] = useState<string>(
    PICKUP_DEFAULTS.closeTime,
  );

  const handleBookPickup = async () => {
    if (pickupBusy) return;
    setPickupBusy(true);
    setPickupError(null);
    setPickupResult(null);
    try {
      const res = await fetch("/api/shipping/book-pickup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shipping-token": token,
        },
        body: JSON.stringify({
          addressKey: pickupAddressKey,
          date: pickupDate,
          readyTime: pickupReadyTime,
          closeTime: pickupCloseTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPickupError(data.error ?? "Pickup booking failed.");
        return;
      }
      setPickupResult({
        confirmationCode: data.confirmation_code,
        scheduledDate: data.scheduled_date,
        readyTime: data.ready_time,
        closeTime: data.close_time,
        addressLabel: data.address_label,
        environment: data.environment,
      });
    } catch (err) {
      setPickupError(err instanceof Error ? err.message : "Pickup booking failed.");
    } finally {
      setPickupBusy(false);
    }
  };

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
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Shipping failed.");
        return;
      }
      setLastResult({
        trackingNumber: data.tracking_number,
        labelUrl: data.label_url,
        labelCopies: data.label_copies_to_print ?? 3,
        environment: data.environment,
        fedexGeneratedDocs: data.fedex_generated_docs ?? [],
        customsDocs: data.customs_docs ?? [],
      });
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
            environment: data.environment,
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
            <div style={{ marginTop: "14px" }}>
              <div
                style={{
                  fontSize: "13px",
                  color: "#c4973a",
                  fontWeight: 600,
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Pouch checklist — print + assemble:
              </div>
              <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.7 }}>
                {lastResult.labelUrl && (
                  <li>
                    <a
                      href={lastResult.labelUrl}
                      target="_blank"
                      rel="noopener"
                      style={pouchLinkStyle}
                    >
                      FedEx label
                    </a>{" "}
                    — <strong>print {lastResult.labelCopies} copies</strong>{" "}
                    <span style={{ opacity: 0.7 }}>
                      (1 affixed to box, {lastResult.labelCopies - 1} in pouch)
                    </span>
                  </li>
                )}
                {lastResult.fedexGeneratedDocs.map((d) => (
                  <li key={d.fileName}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener"
                      style={pouchLinkStyle}
                    >
                      {formatDocLabel(d.contentType)}
                    </a>{" "}
                    — <strong>print {d.copiesToPrint} copies</strong>{" "}
                    <span style={{ opacity: 0.7 }}>(in pouch)</span>
                  </li>
                ))}
                {lastResult.customsDocs.map((d) => (
                  <li key={d.fileName}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener"
                      style={pouchLinkStyle}
                    >
                      {d.fileName}
                    </a>{" "}
                    — <strong>print 1 copy</strong>{" "}
                    <span style={{ opacity: 0.7 }}>(in pouch)</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Book a Pickup */}
        <section
          style={{
            marginBottom: "32px",
            padding: "20px",
            backgroundColor: "#1a3d22",
            border: "1px solid #2d6b35",
            borderRadius: "12px",
          }}
        >
          <h2
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: "22px",
              color: "#ffffff",
              margin: "0 0 4px 0",
            }}
          >
            Book a Pickup
          </h2>
          <p
            style={{
              fontSize: "12px",
              color: "#6ab04c",
              margin: "0 0 16px 0",
            }}
          >
            Schedule a FedEx courier pickup at a saved address.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <div>
              <label style={pickupLabelStyle}>Date</label>
              <input
                type="date"
                value={pickupDate}
                min={todayCalgaryISO()}
                onChange={(e) => setPickupDate(e.target.value)}
                style={pickupInputStyle}
              />
            </div>
            <div>
              <label style={pickupLabelStyle}>Ready time (Calgary)</label>
              <input
                type="time"
                value={pickupReadyTime}
                onChange={(e) => setPickupReadyTime(e.target.value)}
                style={pickupInputStyle}
              />
            </div>
            <div>
              <label style={pickupLabelStyle}>Close time (Calgary)</label>
              <input
                type="time"
                value={pickupCloseTime}
                onChange={(e) => setPickupCloseTime(e.target.value)}
                style={pickupInputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={pickupLabelStyle}>Pickup address</label>
            <select
              value={pickupAddressKey}
              onChange={(e) => setPickupAddressKey(e.target.value)}
              style={pickupInputStyle}
            >
              {SAVED_PICKUP_ADDRESSES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.displayLabel}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleBookPickup}
            disabled={pickupBusy}
            style={{
              backgroundColor: pickupBusy ? "#8b6a1e" : "#c4973a",
              color: "#0a1a0d",
              border: 0,
              borderRadius: "10px",
              padding: "14px 20px",
              fontSize: "15px",
              fontWeight: 700,
              cursor: pickupBusy ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              width: "100%",
            }}
          >
            {pickupBusy ? "Booking pickup…" : "Book Pickup"}
          </button>

          {pickupError && (
            <div
              style={{
                marginTop: "12px",
                padding: "10px 14px",
                backgroundColor: "rgba(224,82,82,0.12)",
                border: "1px solid #e05252",
                borderRadius: "8px",
                color: "#e05252",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              <strong>Pickup failed:</strong> {pickupError}
            </div>
          )}

          {pickupResult && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px 16px",
                backgroundColor: "rgba(141,198,63,0.1)",
                border: "1px solid #8dc63f",
                borderRadius: "8px",
                color: "#8dc63f",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "6px" }}>
                Pickup confirmed — {pickupResult.confirmationCode}
                {pickupResult.environment === "sandbox" && (
                  <span
                    style={{
                      marginLeft: "8px",
                      color: "#c4973a",
                      fontSize: "12px",
                    }}
                  >
                    (sandbox — no courier will actually come)
                  </span>
                )}
              </div>
              <div style={{ opacity: 0.85 }}>
                {pickupResult.scheduledDate} · {pickupResult.readyTime} –{" "}
                {pickupResult.closeTime} · {pickupResult.addressLabel}
              </div>
            </div>
          )}
        </section>

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

const pouchLinkStyle: React.CSSProperties = {
  color: "#c4973a",
  fontWeight: 700,
  textDecoration: "underline",
};

const pickupLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  marginBottom: "6px",
  color: "#c4973a",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontWeight: 600,
};

const pickupInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #2d6b35",
  borderRadius: "8px",
  backgroundColor: "#0f2614",
  color: "#ffffff",
  fontSize: "14px",
  fontFamily: "inherit",
};

function formatDocLabel(contentType: string): string {
  // Convert FedEx enum (COMMERCIAL_INVOICE) to readable label
  // (Commercial invoice) for the pouch checklist.
  return contentType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

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
