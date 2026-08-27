import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data model helpers for the admin calendar view.
 *
 * Fetches every order with an appointment in the given window and
 * shapes the result for chip rendering: patient name, tests + codes,
 * kit-vs-phlebotomy classification, and per-order revenue + cost so
 * the month view can show gross profit at a glance.
 *
 * "Kit" orders (all tests self-collected) are shown orange; anything
 * else (has at least one phlebotomy line) is shown green because it
 * still requires a FloLabs mobile visit.
 */

export interface CalendarAppointment {
  orderId: string;
  patientName: string;
  patientDob: string | null;
  patientSex: string | null;
  appointmentAt: string; // ISO
  appointmentEndAt: string | null;
  totalCad: number;
  costCad: number;
  grossProfitCad: number;
  isKitOnly: boolean;
  tests: Array<{
    id: string;
    name: string;
    sku: string | null;
    collectionMethod: "phlebotomist_draw" | "self_collected_kit";
    priceCad: number | null;
    costCad: number | null;
  }>;
}

export async function fetchCalendarAppointments(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
): Promise<CalendarAppointment[]> {
  // Pull orders in the window along with all order_lines and joined
  // tests/patient rows in one round-trip. Supabase's PostgREST joins
  // over foreign keys handle this cleanly.
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
        id,
        account_id,
        total_cad,
        appointment_at,
        appointment_end_at,
        order_lines:order_lines (
          line_type,
          test_id,
          profile_id,
          custom_description,
          tests:tests (
            id,
            name,
            sku,
            price_cad,
            cost_cad,
            collection_method
          ),
          patient_profiles:patient_profiles (
            first_name,
            last_name,
            date_of_birth,
            biological_sex
          )
        )
      `,
    )
    .not("appointment_at", "is", null)
    .gte("appointment_at", startISO)
    .lt("appointment_at", endISO);

  if (error || !data) return [];

  type OrderRow = {
    id: string;
    account_id: string;
    total_cad: number | null;
    appointment_at: string;
    appointment_end_at: string | null;
    order_lines: Array<{
      line_type: string;
      test_id: string | null;
      custom_description: string | null;
      tests: {
        id: string;
        name: string;
        sku: string | null;
        price_cad: number | null;
        cost_cad: number | null;
        collection_method: "phlebotomist_draw" | "self_collected_kit";
      } | null;
      patient_profiles: {
        first_name: string;
        last_name: string;
        date_of_birth: string | null;
        biological_sex: string | null;
      } | null;
    }>;
  };
  const rows = data as unknown as OrderRow[];

  // Fallback profile lookup by account_id — needed for invoice-mirrored
  // orders whose test lines have no joined patient_profiles row, or
  // whose test line is a custom-description "resource" instead of a
  // real test. Without this such orders silently vanish from the
  // calendar even after appointment_at is stamped.
  const accountIds = Array.from(
    new Set(rows.map((r) => r.account_id).filter(Boolean)),
  );
  const primaryProfileByAccount = new Map<
    string,
    {
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
      biological_sex: string | null;
    }
  >();
  if (accountIds.length > 0) {
    const { data: profRows } = await supabase
      .from("patient_profiles")
      .select("account_id, first_name, last_name, date_of_birth, biological_sex")
      .in("account_id", accountIds)
      .eq("is_primary", true);
    for (const p of (profRows ?? []) as Array<{
      account_id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
      biological_sex: string | null;
    }>) {
      primaryProfileByAccount.set(p.account_id, {
        first_name: p.first_name,
        last_name: p.last_name,
        date_of_birth: p.date_of_birth,
        biological_sex: p.biological_sex,
      });
    }
  }

  const appointments: CalendarAppointment[] = [];
  for (const row of rows) {
    // Real test lines with a joined tests row — the happy path.
    const testLines = (row.order_lines ?? []).filter(
      (l) => l.line_type === "test" && l.tests,
    );
    const tests = testLines.map((l) => ({
      id: l.tests!.id,
      name: l.tests!.name,
      sku: l.tests!.sku,
      collectionMethod: l.tests!.collection_method,
      priceCad: l.tests!.price_cad,
      costCad: l.tests!.cost_cad,
    }));

    // Fallback: if there are no joined test lines, cover two more cases
    // that show up on invoice-mirrored orders:
    //   (a) test line with test_id = null and custom_description = null
    //       — the invoice had a freeform test whose SKU isn't in the
    //       tests catalogue (e.g. MOLD1). We know it's a phlebotomy
    //       visit; render a generic chip so it doesn't disappear.
    //   (b) resource/custom lines whose custom_description looks like a
    //       test — invoice entered it as a custom line rather than
    //       picking from the catalog.
    // Suppress pure fee/discount lines so we don't render a
    // "Collection Fees" chip on an otherwise-empty order.
    const isFeeOrDiscount = (desc: string | null | undefined) =>
      typeof desc === "string" &&
      /\b(collect|flolab|shipping\s+fee|delivery\s+fee|discount)\b/i.test(desc);

    if (tests.length === 0) {
      const freeformTestLines = (row.order_lines ?? []).filter(
        (l) => l.line_type === "test" && !l.tests,
      );
      const customLines = (row.order_lines ?? []).filter(
        (l) =>
          (l.line_type === "resource" || l.line_type === "custom") &&
          l.custom_description &&
          !isFeeOrDiscount(l.custom_description),
      );
      if (freeformTestLines.length === 0 && customLines.length === 0) {
        continue;
      }
      for (let i = 0; i < freeformTestLines.length; i++) {
        const l = freeformTestLines[i];
        tests.push({
          id: `freeform-${row.id}-${i}`,
          name: l.custom_description ?? "Test collection",
          sku: null,
          collectionMethod: "phlebotomist_draw",
          priceCad: null,
          costCad: null,
        });
      }
      for (const l of customLines) {
        tests.push({
          id: `custom-${row.id}-${l.custom_description}`,
          name: l.custom_description!,
          sku: null,
          collectionMethod: "phlebotomist_draw",
          priceCad: null,
          costCad: null,
        });
      }
    }

    const costCad = tests.reduce((sum, t) => sum + (t.costCad ?? 0), 0);
    const totalCad = row.total_cad ?? 0;
    const isKitOnly = tests.every(
      (t) => t.collectionMethod === "self_collected_kit",
    );

    // Patient identity — prefer a profile joined onto a line, fall back
    // to the account's primary profile so invoice-mirrored orders don't
    // render as "Unknown patient".
    const firstProfile = (row.order_lines ?? [])
      .map((l) => l.patient_profiles)
      .find((p): p is NonNullable<typeof p> => p != null);
    const fallbackProfile = firstProfile ?? primaryProfileByAccount.get(row.account_id) ?? null;
    const patientName = fallbackProfile
      ? `${fallbackProfile.first_name} ${fallbackProfile.last_name}`.trim()
      : "Unknown patient";

    appointments.push({
      orderId: row.id,
      patientName,
      patientDob: fallbackProfile?.date_of_birth ?? null,
      patientSex: fallbackProfile?.biological_sex ?? null,
      appointmentAt: row.appointment_at,
      appointmentEndAt: row.appointment_end_at,
      totalCad,
      costCad,
      grossProfitCad: totalCad - costCad,
      isKitOnly,
      tests,
    });
  }

  return appointments;
}
