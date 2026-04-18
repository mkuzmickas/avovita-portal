import { createServiceRoleClient } from "@/lib/supabase/server";
import { AdminPatientsTable } from "@/components/admin/AdminPatientsTable";

export const dynamic = "force-dynamic";

export type AdminPatientProfile = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  biological_sex: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  is_primary: boolean;
  is_minor: boolean;
  is_dependent: boolean | null;
  relationship: string | null;
};

export type AdminPatientRow = {
  id: string;
  email: string | null;
  phone: string | null;
  is_representative: boolean;
  created_at: string;
  waiver_completed: boolean;
  waiver_completed_at: string | null;
  profiles: AdminPatientProfile[];
  ordersCount: number;
  primaryName: string;
  primaryPhone: string | null;
  org_id: string | null;
  org_name: string | null;
  org_color: string | null;
};

export default async function AdminPatientsPage() {
  const service = createServiceRoleClient();

  const { data: accountsRaw } = await service
    .from("accounts")
    .select(
      `
      id, email, phone, is_representative, created_at, waiver_completed, waiver_completed_at,
      org:organizations(id, name, primary_color),
      profiles:patient_profiles(
        id, first_name, last_name, date_of_birth, biological_sex,
        phone, address_line1, address_line2, city, province, postal_code,
        is_primary, is_minor, is_dependent, relationship
      )
    `
    )
    .eq("role", "patient")
    .order("created_at", { ascending: false });

  type RawAccount = {
    id: string;
    email: string | null;
    phone: string | null;
    is_representative: boolean | null;
    created_at: string;
    waiver_completed: boolean;
    waiver_completed_at: string | null;
    profiles: AdminPatientProfile[];
    org:
      | { id: string; name: string; primary_color: string }
      | { id: string; name: string; primary_color: string }[]
      | null;
  };

  const accounts = (accountsRaw ?? []) as unknown as RawAccount[];
  const accountIds = accounts.map((a) => a.id);

  const orderCountMap = new Map<string, number>();
  if (accountIds.length > 0) {
    const { data: ordersForCount } = await service
      .from("orders")
      .select("account_id")
      .in("account_id", accountIds);

    for (const row of (ordersForCount ?? []) as Array<{
      account_id: string;
    }>) {
      orderCountMap.set(
        row.account_id,
        (orderCountMap.get(row.account_id) ?? 0) + 1
      );
    }
  }

  const patients: AdminPatientRow[] = accounts.map((account) => {
    const isRep = !!account.is_representative;
    // Representatives have no primary profile of their own — label by
    // the dependents they're caring for (or fall back to email).
    const primary =
      account.profiles.find((p) => p.is_primary) ?? account.profiles[0];
    let primaryName: string;
    if (isRep) {
      const dependents = account.profiles.filter((p) => p.is_dependent);
      if (dependents.length === 0) {
        primaryName = "—";
      } else if (dependents.length === 1) {
        primaryName = `${dependents[0].first_name} ${dependents[0].last_name}`;
      } else {
        primaryName = `${dependents[0].first_name} ${dependents[0].last_name} +${dependents.length - 1}`;
      }
    } else {
      primaryName = primary
        ? `${primary.first_name} ${primary.last_name}`
        : "—";
    }
    const org = Array.isArray(account.org) ? account.org[0] : account.org;
    return {
      id: account.id,
      email: account.email,
      phone: account.phone,
      is_representative: isRep,
      created_at: account.created_at,
      waiver_completed: account.waiver_completed,
      waiver_completed_at: account.waiver_completed_at,
      profiles: account.profiles,
      ordersCount: orderCountMap.get(account.id) ?? 0,
      primaryName,
      primaryPhone: primary?.phone ?? account.phone ?? null,
      org_id: org?.id ?? null,
      org_name: org?.name ?? null,
      org_color: org?.primary_color ?? null,
    };
  });

  const waiverPendingCount = patients.filter(
    (p) => !p.waiver_completed
  ).length;

  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>Clients</span>
          </h1>
          <p className="mt-1" style={{ color: "#e8d5a3" }}>
            Manage client accounts and profiles.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {waiverPendingCount > 0 && (
            <div
              className="rounded-lg border px-4 py-2"
              style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
            >
              <p className="text-xs" style={{ color: "#c4973a" }}>
                Waiver Pending
              </p>
              <p
                className="text-xl font-semibold"
                style={{ color: "#c4973a" }}
              >
                {waiverPendingCount}
              </p>
            </div>
          )}
          <div
            className="rounded-lg border px-4 py-2"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <p className="text-xs" style={{ color: "#6ab04c" }}>
              Total Patients
            </p>
            <p
              className="text-xl font-semibold"
              style={{ color: "#c4973a" }}
            >
              {patients.length}
            </p>
          </div>
        </div>
      </div>

      <AdminPatientsTable patients={patients} />
    </div>
  );
}
