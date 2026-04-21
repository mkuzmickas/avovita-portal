import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { QuoteBuilder } from "@/components/admin/QuoteBuilder";
import type { Quote } from "@/types/database";

export const dynamic = "force-dynamic";

export type QuoteLineWithTest = {
  id: string;
  test_id: string;
  person_label: string | null;
  unit_price_cad: number;
  test_name: string;
  test_sku: string | null;
  lab_name: string;
  stability_days: number | null;
  ship_temperature: string | null;
};

export type CatalogueTestForQuote = {
  id: string;
  name: string;
  sku: string | null;
  price_cad: number;
  /** Wholesale cost — used for the admin-only Margin line. */
  cost_cad: number | null;
  lab_name: string;
  stability_days: number | null;
  ship_temperature: string | null;
};

export default async function AdminQuoteBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceRoleClient();

  const { data: quoteRaw } = await service
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
    .eq("id", id)
    .maybeSingle();
  const quote = quoteRaw as Quote | null;
  if (!quote) notFound();

  const { data: linesRaw } = await service
    .from("quote_lines")
    .select(
      `
      id, test_id, person_label, unit_price_cad,
      test:tests ( name, sku, stability_days, ship_temperature, lab:labs ( name ) )
    `
    )
    .eq("quote_id", id)
    .order("created_at", { ascending: true });

  type RawLine = {
    id: string;
    test_id: string;
    person_label: string | null;
    unit_price_cad: number;
    test: {
      name: string;
      sku: string | null;
      stability_days: number | null;
      ship_temperature: string | null;
      lab: { name: string } | { name: string }[] | null;
    } | null;
  };
  const lines: QuoteLineWithTest[] = ((linesRaw ?? []) as unknown as RawLine[]).map(
    (l) => {
      const lab = Array.isArray(l.test?.lab) ? l.test?.lab[0] : l.test?.lab;
      return {
        id: l.id,
        test_id: l.test_id,
        person_label: l.person_label,
        unit_price_cad: l.unit_price_cad,
        test_name: l.test?.name ?? "Test",
        test_sku: l.test?.sku ?? null,
        lab_name: lab?.name ?? "—",
        stability_days: l.test?.stability_days ?? null,
        ship_temperature: l.test?.ship_temperature ?? null,
      };
    }
  );

  // Active tests with a price (only priced tests can be added to a quote)
  const { data: testsRaw } = await service
    .from("tests")
    .select(
      "id, name, sku, price_cad, cost_cad, stability_days, ship_temperature, lab:labs(name)"
    )
    .eq("active", true)
    .not("price_cad", "is", null)
    .order("name", { ascending: true });

  type RawTest = {
    id: string;
    name: string;
    sku: string | null;
    price_cad: number;
    cost_cad: number | null;
    stability_days: number | null;
    ship_temperature: string | null;
    lab: { name: string } | { name: string }[] | null;
  };
  const catalogue: CatalogueTestForQuote[] = (
    (testsRaw ?? []) as unknown as RawTest[]
  ).map((t) => {
    const lab = Array.isArray(t.lab) ? t.lab[0] : t.lab;
    return {
      id: t.id,
      name: t.name,
      sku: t.sku,
      price_cad: t.price_cad,
      cost_cad: t.cost_cad == null ? null : Number(t.cost_cad),
      lab_name: lab?.name ?? "—",
      stability_days: t.stability_days,
      ship_temperature: t.ship_temperature,
    };
  });

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <QuoteBuilder
        initialQuote={quote}
        initialLines={lines}
        catalogue={catalogue}
      />
    </div>
  );
}
