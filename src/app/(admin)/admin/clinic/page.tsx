import { createServiceRoleClient } from "@/lib/supabase/server";
import { ClinicDayClient } from "@/components/admin/ClinicDayClient";

export const dynamic = "force-dynamic";

export type ClinicAppointment = {
  id: string;
  short_id: string;
  appointment_at: string;
  appointment_end_at: string | null;
  status: string;
  total_cad: number;
  collection_mode: "mobile" | "clinic" | "out_of_town" | null;
  account: {
    id: string;
    email: string | null;
  } | null;
  client_label: string;
  /** DOB of the primary patient profile tied to this order (ISO date,
   *  no time). Mike generates Mayo labels from the clinic page and
   *  Mayo requires DOB per patient, so this is first-class. */
  client_dob: string | null;
  test_summaries: string[];
};

/**
 * /admin/clinic — Jane-App-style day calendar for in-clinic appointments.
 *
 * Admin-only. The grid is a strict 15-minute lane from 08:00 to 18:00
 * (configurable later). Appointments render as chips at their start
 * time; two or more appointments at the same slot stack vertically
 * (the "double stack" Mike wants).
 *
 * This first cut shows ANY order that has an appointment_at on the
 * picked day, regardless of collection_mode. That lets Mike see the
 * calendar immediately with real data. A badge marks whether the row
 * is clinic / mobile / out-of-town. Once he's piloting clinic
 * bookings for real, a toggle will filter to clinic-only.
 */
export default async function ClinicDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  // Default to today in Calgary local.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Edmonton",
  });
  const dateIso =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : today;

  const service = createServiceRoleClient();

  // Day boundaries in Calgary local, converted to UTC for the query.
  // Covers 00:00 to 23:59:59 local on the picked date.
  const dayStartLocal = new Date(`${dateIso}T00:00:00-06:00`);
  const dayEndLocal = new Date(dayStartLocal.getTime() + 24 * 60 * 60 * 1000);

  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      `
      id, status, total_cad, appointment_at, appointment_end_at,
      collection_mode,
      account:accounts ( id, email ),
      order_lines (
        test:tests ( name, sku ),
        profile:patient_profiles ( first_name, last_name, date_of_birth, is_primary )
      )
    `,
    )
    .not("appointment_at", "is", null)
    .gte("appointment_at", dayStartLocal.toISOString())
    .lt("appointment_at", dayEndLocal.toISOString())
    .order("appointment_at", { ascending: true });

  type RawOrder = {
    id: string;
    status: string;
    total_cad: number | null;
    appointment_at: string;
    appointment_end_at: string | null;
    collection_mode: string | null;
    account: { id: string; email: string | null } | null;
    order_lines: Array<{
      test: { name: string | null; sku: string | null } | null;
      profile: {
        first_name: string | null;
        last_name: string | null;
        date_of_birth: string | null;
        is_primary: boolean | null;
      } | null;
    }>;
  };

  const appointments: ClinicAppointment[] = (
    (ordersRaw ?? []) as unknown as RawOrder[]
  ).map((o) => {
    const profiles = (o.order_lines ?? [])
      .map((l) => l.profile)
      .filter((p): p is NonNullable<typeof p> => p != null);
    const primary = profiles.find((p) => p.is_primary) ?? profiles[0];
    const name =
      primary && (primary.first_name || primary.last_name)
        ? `${primary.first_name ?? ""} ${primary.last_name ?? ""}`.trim()
        : (o.account?.email ?? "(unknown client)");
    // DOB preference: the primary profile's DOB. Fall back to any
    // joined profile's DOB — invoice-mirrored orders don't always
    // have a primary flag set but still carry a dob somewhere.
    const dob =
      primary?.date_of_birth ??
      profiles.find((p) => p.date_of_birth)?.date_of_birth ??
      null;

    const testSummaries = Array.from(
      new Set(
        (o.order_lines ?? [])
          .map((l) => l.test?.sku ?? l.test?.name ?? null)
          .filter((v): v is string => !!v),
      ),
    );

    return {
      id: o.id,
      short_id: o.id.slice(0, 8).toUpperCase(),
      appointment_at: o.appointment_at,
      appointment_end_at: o.appointment_end_at,
      status: o.status,
      total_cad: Number(o.total_cad ?? 0),
      collection_mode: (o.collection_mode as ClinicAppointment["collection_mode"]) ?? null,
      account: o.account,
      client_label: name,
      client_dob: dob,
      test_summaries: testSummaries,
    };
  });

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <ClinicDayClient dateIso={dateIso} appointments={appointments} />
    </div>
  );
}
