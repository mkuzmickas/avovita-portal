import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { BookingQueueClient } from "./BookingQueueClient";
import { RematchAllButton } from "@/components/admin/RematchAllButton";

export const dynamic = "force-dynamic";

export default async function BookingsQueuePage() {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("booking_events")
    .select(
      "id, received_at, parsed_client_name, parsed_client_email, parsed_client_phone, parsed_appointment_at, parsed_address, parse_warnings, resolution, matched_order_id, match_score, match_matched_by, candidate_snapshot",
    )
    .in("resolution", ["needs_review", "no_match"])
    .order("received_at", { ascending: false })
    .limit(50);

  // Also show the LAST 48h of events across all resolutions so Mike can
  // tell at a glance whether the inbox poller is firing at all. The
  // most common "it's broken" question is actually "is anything landing
  // in the first place?" — showing recent auto_assigned rows alongside
  // review queue answers it without needing a Supabase SQL console.
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: recentData } = await service
    .from("booking_events")
    .select(
      "id, received_at, parsed_client_name, parsed_appointment_at, resolution, matched_order_id, match_score, match_matched_by",
    )
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(30);
  const recent = (recentData ?? []) as Array<{
    id: string;
    received_at: string;
    parsed_client_name: string | null;
    parsed_appointment_at: string | null;
    resolution: string;
    matched_order_id: string | null;
    match_score: number | null;
    match_matched_by: string[];
  }>;

  const resolutionCounts = recent.reduce<Record<string, number>>((acc, r) => {
    acc[r.resolution] = (acc[r.resolution] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Booking <span style={{ color: "#c4973a" }}>Review Queue</span>
          </h1>
          <p className="mt-1" style={{ color: "#e8d5a3" }}>
            FloLabs confirmations forwarded from Outlook that need Jenna to
            confirm which order they belong to.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <RematchAllButton />
          <Link
            href="/admin/calendar"
            style={{
              padding: "8px 14px",
              border: "1px solid #2d6b35",
              borderRadius: "8px",
              backgroundColor: "transparent",
              color: "#e8d5a3",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            ← Back to Calendar
          </Link>
        </div>
      </div>

      {/* Inbox-poller health strip — tells Mike whether emails are
          landing at all. Zero rows in 48h is the signal that the Graph
          credentials are stale or the Outlook rule is off. */}
      <div
        className="mb-6 rounded-lg border px-4 py-3"
        style={{
          borderColor: "#2d6b35",
          backgroundColor: "#0f2614",
        }}
      >
        <div
          className="text-xs mb-2"
          style={{
            color: "#c4973a",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 700,
          }}
        >
          Last 48 h · booking emails processed
        </div>
        {recent.length === 0 ? (
          <p style={{ color: "#e88b8b", fontSize: 14 }}>
            Zero inbound bookings in the last 48 h. Check: (a) Microsoft
            Graph credentials for the inbox poller, (b) the Power Automate
            / Outlook rule forwarding Acuity emails, (c) /api/cron/poll-flolabs-inbox
            logs in Vercel.
          </p>
        ) : (
          <div style={{ color: "#e8d5a3", fontSize: 14 }}>
            <strong>{recent.length}</strong> event{recent.length === 1 ? "" : "s"}
            {" · "}
            <span style={{ color: "#8dc63f" }}>
              {resolutionCounts.auto_assigned ?? 0} auto-assigned
            </span>
            {" · "}
            <span style={{ color: "#c4973a" }}>
              {resolutionCounts.needs_review ?? 0} needs review
            </span>
            {" · "}
            <span style={{ color: "#e88b8b" }}>
              {resolutionCounts.no_match ?? 0} no match
            </span>
            {resolutionCounts.superseded ? (
              <>
                {" · "}
                <span style={{ color: "#6ab04c" }}>
                  {resolutionCounts.superseded} superseded
                </span>
              </>
            ) : null}
          </div>
        )}
        {recent.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ color: "#8dc63f", fontSize: 12, cursor: "pointer" }}>
              Show recent events
            </summary>
            <table
              style={{
                width: "100%",
                marginTop: 8,
                fontSize: 12,
                color: "#e8d5a3",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr style={{ color: "#8dc63f" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Received</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Client</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Appt</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Resolution</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Score</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Matched by</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #1a3d22" }}>
                    <td style={{ padding: "4px 8px" }}>
                      {new Date(r.received_at).toLocaleString("en-CA", {
                        timeZone: "America/Edmonton",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      {r.parsed_client_name ?? "?"}
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      {r.parsed_appointment_at
                        ? new Date(r.parsed_appointment_at).toLocaleString("en-CA", {
                            timeZone: "America/Edmonton",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "?"}
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      <span
                        style={{
                          color:
                            r.resolution === "auto_assigned"
                              ? "#8dc63f"
                              : r.resolution === "needs_review"
                                ? "#c4973a"
                                : "#e88b8b",
                        }}
                      >
                        {r.resolution}
                      </span>
                    </td>
                    <td style={{ padding: "4px 8px" }}>{r.match_score ?? "—"}</td>
                    <td style={{ padding: "4px 8px" }}>
                      {r.match_matched_by?.length
                        ? r.match_matched_by.join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <BookingQueueClient events={(data ?? []) as unknown as QueuedEvent[]} />
    </div>
  );
}

export interface QueuedEvent {
  id: string;
  received_at: string;
  parsed_client_name: string | null;
  parsed_client_email: string | null;
  parsed_client_phone: string | null;
  parsed_appointment_at: string | null;
  parsed_address: string | null;
  parse_warnings: string[];
  resolution: string;
  matched_order_id: string | null;
  match_score: number | null;
  match_matched_by: string[];
  candidate_snapshot: Array<{
    orderId: string;
    accountEmail: string | null;
    accountName: string | null;
    patientNames: string[];
    tests: string[];
    totalCad: number | null;
    /** Optional: older rows in booking_events pre-date this field. */
    createdAt?: string | null;
    matchScore: number;
    matchedBy: string[];
  }> | null;
}
