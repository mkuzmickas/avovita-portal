import { NewBookingClient } from "./NewBookingClient";

export const dynamic = "force-dynamic";

export default function NewBookingPage() {
  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Log a <span style={{ color: "#c4973a" }}>FloLabs booking</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Paste the Acuity confirmation email you received at{" "}
          <code style={{ color: "#c4973a" }}>info@flolabs.ca</code>. Portal
          parses the client + time and matches it to an unscheduled order.
        </p>
      </div>
      <NewBookingClient />
    </div>
  );
}
