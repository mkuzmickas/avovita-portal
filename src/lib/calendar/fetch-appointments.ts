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
        total_cad,
        appointment_at,
        appointment_end_at,
        order_lines:order_lines (
          line_type,
          test_id,
          profile_id,
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

  const appointments: CalendarAppointment[] = [];
  type OrderRow = {
    id: string;
    total_cad: number | null;
    appointment_at: string;
    appointment_end_at: string | null;
    order_lines: Array<{
      line_type: string;
      test_id: string | null;
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

  for (const row of data as unknown as OrderRow[]) {
    // Only consider 'test' lines — supplements/resources don't show
    // up on the collection calendar.
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
    if (tests.length === 0) continue; // no tests → nothing to visit for

    const costCad = tests.reduce((sum, t) => sum + (t.costCad ?? 0), 0);
    const totalCad = row.total_cad ?? 0;
    const isKitOnly = tests.every(
      (t) => t.collectionMethod === "self_collected_kit",
    );

    // Grab patient identity — use the first non-null patient_profile
    // found across the order's lines. Multi-person orders (rare) will
    // still show one representative name; drill-in shows the full list.
    const firstProfile = testLines
      .map((l) => l.patient_profiles)
      .find((p): p is NonNullable<typeof p> => p != null);
    const patientName = firstProfile
      ? `${firstProfile.first_name} ${firstProfile.last_name}`.trim()
      : "Unknown patient";

    appointments.push({
      orderId: row.id,
      patientName,
      patientDob: firstProfile?.date_of_birth ?? null,
      patientSex: firstProfile?.biological_sex ?? null,
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
