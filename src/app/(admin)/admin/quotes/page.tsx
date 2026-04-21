import { createServiceRoleClient } from "@/lib/supabase/server";
import { QuotesListClient } from "@/components/admin/QuotesListClient";
import type { Quote } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminQuotesPage() {
  const service = createServiceRoleClient();

  const { data: quotesRaw } = await service
    .from("quotes")
    .select(
      `
      id, quote_number, client_first_name, client_last_name, client_email,
      person_count, collection_city, notes, status,
      subtotal_cad, discount_cad, visit_fee_cad, total_cad, gst_cad,
      manual_discount_value, manual_discount_type,
      sent_at, expires_at, created_by, created_at, updated_at
    `
    )
    .order("created_at", { ascending: false });

  const quotes = (quotesRaw ?? []) as unknown as Quote[];

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>Quotes</span>
          </h1>
          <p className="mt-1" style={{ color: "#e8d5a3" }}>
            Build and send branded quotes to prospective clients.
          </p>
        </div>
      </div>
      <QuotesListClient initialQuotes={quotes} />
    </div>
  );
}
