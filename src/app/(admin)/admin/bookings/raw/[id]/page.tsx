import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Read-only view of the raw email body stored on a booking_events row,
 * for debugging parser misses. Admin-only via middleware; no PII
 * handling beyond what already appears in the queue page.
 */
export default async function RawBookingEmailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceRoleClient();
  const { data } = await service
    .from("booking_events")
    .select(
      "id, received_at, parsed_client_name, parsed_appointment_at, resolution, raw_email, parse_warnings",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const event = data as {
    id: string;
    received_at: string;
    parsed_client_name: string | null;
    parsed_appointment_at: string | null;
    resolution: string;
    raw_email: string | null;
    parse_warnings: string[] | null;
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <div className="mb-4">
        <Link
          href="/admin/bookings/queue"
          style={{ color: "#8dc63f", fontSize: 13 }}
        >
          ← Back to Booking Queue
        </Link>
      </div>
      <h1
        className="font-heading text-2xl font-semibold mb-3"
        style={{
          color: "#ffffff",
          fontFamily: '"Playfair Display", Georgia, serif',
        }}
      >
        Raw email · <span style={{ color: "#c4973a" }}>{event.parsed_client_name ?? "?"}</span>
      </h1>
      <p style={{ color: "#e8d5a3", fontSize: 13, marginBottom: 16 }}>
        Received {new Date(event.received_at).toLocaleString("en-CA")} ·
        Resolution: <strong>{event.resolution}</strong>
      </p>
      {event.parse_warnings && event.parse_warnings.length > 0 && (
        <div
          className="rounded-lg border px-4 py-3 mb-4"
          style={{
            borderColor: "#c4973a",
            backgroundColor: "rgba(196,151,58,0.08)",
            color: "#c4973a",
            fontSize: 13,
          }}
        >
          ⚠ {event.parse_warnings.join(" ")}
        </div>
      )}
      <pre
        style={{
          backgroundColor: "#0f2614",
          border: "1px solid #2d6b35",
          borderRadius: 8,
          color: "#e8d5a3",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          lineHeight: 1.5,
          padding: 16,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: "70vh",
          overflow: "auto",
        }}
      >
        {event.raw_email ?? "(no raw body stored)"}
      </pre>
    </div>
  );
}
