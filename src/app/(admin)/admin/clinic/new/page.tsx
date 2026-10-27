import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Placeholder for the "New clinic appointment" wizard. Phase 2 will
 * wire the client picker + test picker + Stripe PaymentElement here.
 * Rendered now so the "+ New appointment" and empty-slot links on the
 * clinic day grid don't 404 during the pilot.
 */
export default async function NewClinicAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; time?: string }>;
}) {
  const { date, time } = await searchParams;
  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1
        className="font-heading text-2xl font-semibold mb-3"
        style={{
          color: "#ffffff",
          fontFamily:
            '"Playfair Display", "Cormorant Garamond", Georgia, serif',
        }}
      >
        New clinic appointment
      </h1>
      <p style={{ color: "#e8d5a3", fontSize: 14 }}>
        Phase 2 — client picker, test picker, and card charge land here.
        For now this is a placeholder so the links on the day grid don't
        404.
      </p>
      {(date || time) && (
        <p style={{ color: "#8dc63f", fontSize: 12, marginTop: 12 }}>
          Carried over from the grid: {date ? `date=${date}` : ""}
          {date && time ? " · " : ""}
          {time ? `time=${time}` : ""}
        </p>
      )}
      <div style={{ marginTop: 24 }}>
        <Link
          href={`/admin/clinic${date ? `?date=${date}` : ""}`}
          style={{
            color: "#c4973a",
            fontSize: 13,
            textDecoration: "underline",
          }}
        >
          ← Back to clinic day
        </Link>
      </div>
    </div>
  );
}
