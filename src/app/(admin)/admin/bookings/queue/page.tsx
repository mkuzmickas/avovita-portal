import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { BookingQueueClient } from "./BookingQueueClient";

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
    matchScore: number;
    matchedBy: string[];
  }> | null;
}
