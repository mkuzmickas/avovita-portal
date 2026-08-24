import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, Calendar, Package, ExternalLink } from "lucide-react";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PatientResultsRepository } from "@/components/admin/PatientResultsRepository";
import { ProfileEditTrigger } from "@/components/admin/ProfileEditTrigger";
import type { AdminPatientProfile } from "@/app/(admin)/admin/patients/page";
import type { OrderStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export type PatientRepositoryResult = {
  id: string;
  file_name: string;
  uploaded_at: string;
  profile_id: string;
  profile_label: string;
  /**
   * Free-form. Production data uses 'order_attached', 'manual_upload',
   * 'patient_upload' — not the values migration 003 declared. Treat as
   * advisory and classify rows via @/lib/results/classify (which keys
   * off order_id, the structural truth).
   */
  source: string | null;
  document_type: string | null;
  document_date: string | null;
  description: string | null;
  /** Raw FK; non-null = order-attached. */
  order_id: string | null;
  /** First 8 chars of order_id for display. Null when order_id is null. */
  order_id_short: string | null;
  /** Email of the admin/account that uploaded this row. Null for system uploads. */
  uploaded_by_email: string | null;
};

function statusColorFor(status: OrderStatus): { bg: string; fg: string } {
  switch (status) {
    case "complete":
    case "resulted":
      return { bg: "rgba(106,176,76,0.15)", fg: "#6ab04c" };
    case "shipped":
    case "collected":
      return { bg: "rgba(196,151,58,0.15)", fg: "#c4973a" };
    case "cancelled":
      return { bg: "rgba(220,90,90,0.15)", fg: "#dc5a5a" };
    default:
      return { bg: "rgba(232,213,163,0.10)", fg: "#e8d5a3" };
  }
}

export default async function AdminPatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: accountId } = await params;
  const service = createServiceRoleClient();

  const { data: accountRaw } = await service
    .from("accounts")
    .select(
      `
      id, email, phone, is_representative, created_at, waiver_completed, waiver_completed_at,
      profiles:patient_profiles(
        id, first_name, last_name, date_of_birth, biological_sex,
        phone, address_line1, address_line2, city, province, postal_code,
        is_primary, is_minor, is_dependent, relationship
      )
    `
    )
    .eq("id", accountId)
    .eq("role", "patient")
    .maybeSingle();

  type RawAccount = {
    id: string;
    email: string | null;
    phone: string | null;
    is_representative: boolean | null;
    created_at: string;
    waiver_completed: boolean;
    waiver_completed_at: string | null;
    profiles: AdminPatientProfile[];
  };
  const account = accountRaw as RawAccount | null;
  if (!account) notFound();

  const isRep = !!account.is_representative;
  const dependents = account.profiles.filter((p) => p.is_dependent);
  const primary =
    account.profiles.find((p) => p.is_primary) ?? account.profiles[0] ?? null;
  const repRelationship =
    dependents.find((d) => d.relationship)?.relationship ?? null;
  const repRelationshipLabel = repRelationship
    ? ({
        power_of_attorney: "Power of Attorney",
        parent_guardian: "Parent / Guardian",
        spouse_partner: "Spouse / Partner",
        healthcare_worker: "Healthcare Worker",
        other: "Representative",
      } as Record<string, string>)[repRelationship] ?? repRelationship
    : null;
  let primaryName: string;
  if (isRep) {
    if (dependents.length === 0) primaryName = account.email ?? "Representative";
    else if (dependents.length === 1)
      primaryName = `${dependents[0].first_name} ${dependents[0].last_name}`;
    else
      primaryName = `${dependents[0].first_name} ${dependents[0].last_name} +${dependents.length - 1}`;
  } else {
    primaryName = primary
      ? `${primary.first_name} ${primary.last_name}`
      : (account.email ?? "Unknown");
  }

  const profileIds = account.profiles.map((p) => p.id);
  const profileLabelById = new Map<string, string>(
    account.profiles.map((p) => [
      p.id,
      `${p.first_name} ${p.last_name}${p.is_primary ? " (primary)" : ""}`,
    ])
  );

  // Pull every result tied to this account's profiles — manual + order +
  // patient self-uploads — so the admin sees one mixed list.
  const { data: resultsRaw } =
    profileIds.length === 0
      ? { data: [] }
      : await service
          .from("results")
          .select(
            "id, file_name, uploaded_at, profile_id, source, document_type, document_date, description, order_id, uploaded_by, storage_path"
          )
          .in("profile_id", profileIds)
          .order("uploaded_at", { ascending: false });

  type RawResult = {
    id: string;
    file_name: string;
    uploaded_at: string;
    profile_id: string;
    source: string | null;
    document_type: string | null;
    document_date: string | null;
    description: string | null;
    order_id: string | null;
    uploaded_by: string;
    storage_path: string;
  };
  const rawResults = ((resultsRaw ?? []) as unknown as RawResult[]).filter(
    // Hide sentinel direct-delivery rows (same convention as the customer page).
    (r) => !r.storage_path.startsWith("__")
  );

  // Resolve uploader emails in one round-trip.
  const uploaderIds = [...new Set(rawResults.map((r) => r.uploaded_by))];
  const uploaderEmailById = new Map<string, string | null>();
  if (uploaderIds.length > 0) {
    const { data: uploadersRaw } = await service
      .from("accounts")
      .select("id, email")
      .in("id", uploaderIds);
    for (const u of (uploadersRaw ?? []) as Array<{
      id: string;
      email: string | null;
    }>) {
      uploaderEmailById.set(u.id, u.email);
    }
  }

  // Order history for this account — everything the account_id ever
  // paid for, newest first, with test list, ship date, tracking, and
  // status. Solves the "thin client profile" gripe.
  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      `
      id, status, total_cad, fedex_tracking_number, shipped_at,
      appointment_at, appointment_date, created_at,
      order_lines(
        id, line_type,
        test:tests(name),
        profile:patient_profiles(first_name, last_name)
      )
    `,
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  type RawOrder = {
    id: string;
    status: OrderStatus;
    total_cad: number | null;
    fedex_tracking_number: string | null;
    shipped_at: string | null;
    appointment_at: string | null;
    appointment_date: string | null;
    created_at: string;
    order_lines: Array<{
      id: string;
      line_type: string | null;
      test: { name: string } | { name: string }[] | null;
      profile:
        | { first_name: string; last_name: string }
        | { first_name: string; last_name: string }[]
        | null;
    }>;
  };
  const orders = ((ordersRaw ?? []) as unknown as RawOrder[]).map((o) => {
    const testLines = (o.order_lines ?? []).filter(
      (l) => (l.line_type ?? "test") === "test",
    );
    const tests: string[] = [];
    const patientLabels = new Set<string>();
    for (const l of testLines) {
      const test = Array.isArray(l.test) ? l.test[0] : l.test;
      if (test?.name) tests.push(test.name);
      const prof = Array.isArray(l.profile) ? l.profile[0] : l.profile;
      if (prof) patientLabels.add(`${prof.first_name} ${prof.last_name}`);
    }
    return {
      id: o.id,
      status: o.status,
      total_cad: o.total_cad,
      fedex_tracking_number: o.fedex_tracking_number,
      shipped_at: o.shipped_at,
      collection_at: o.appointment_at ?? o.appointment_date,
      created_at: o.created_at,
      tests,
      patients: [...patientLabels],
    };
  });

  const results: PatientRepositoryResult[] = rawResults.map((r) => ({
    id: r.id,
    file_name: r.file_name,
    uploaded_at: r.uploaded_at,
    profile_id: r.profile_id,
    profile_label: profileLabelById.get(r.profile_id) ?? "—",
    source: r.source,
    document_type: r.document_type,
    document_date: r.document_date,
    description: r.description,
    order_id: r.order_id,
    order_id_short: r.order_id ? r.order_id.slice(0, 8).toUpperCase() : null,
    uploaded_by_email: uploaderEmailById.get(r.uploaded_by) ?? null,
  }));

  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <Link
        href="/admin/patients"
        className="inline-flex items-center gap-1.5 text-sm mb-3 transition-colors"
        style={{ color: "#e8d5a3" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Patients
      </Link>

      <div className="mb-6">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>{primaryName}</span>
        </h1>
        <div
          className="mt-2 flex flex-wrap items-center gap-3 text-sm"
          style={{ color: "#e8d5a3" }}
        >
          {account.email && (
            <span className="inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" style={{ color: "#c4973a" }} />
              {account.email}
            </span>
          )}
          {(primary?.phone || account.phone) && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" style={{ color: "#c4973a" }} />
              {primary?.phone ?? account.phone}
            </span>
          )}
          {isRep && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border"
              style={{
                backgroundColor: "rgba(196, 151, 58, 0.12)",
                color: "#c4973a",
                borderColor: "#c4973a",
              }}
            >
              Representative account
            </span>
          )}
          <span className="inline-flex items-center gap-1.5" style={{ color: "#6ab04c" }}>
            <Calendar className="w-3.5 h-3.5" />
            Joined {formatDate(account.created_at)}
          </span>
        </div>
      </div>

      {/* Representative details */}
      {isRep && (
        <section
          className="mb-6 rounded-xl border p-5"
          style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        >
          <h2
            className="font-heading text-xl font-semibold mb-3"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Representative <span style={{ color: "#c4973a" }}>details</span>
          </h2>
          <dl
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm"
            style={{ color: "#e8d5a3" }}
          >
            <div>
              <dt className="text-xs" style={{ color: "#6ab04c" }}>
                Email
              </dt>
              <dd>{account.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: "#6ab04c" }}>
                Phone
              </dt>
              <dd>{account.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: "#6ab04c" }}>
                Relationship to clients
              </dt>
              <dd>{repRelationshipLabel ?? "—"}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-xs" style={{ color: "#6ab04c" }}>
                Signing on behalf of
              </dt>
              <dd>
                {dependents.length === 0
                  ? "—"
                  : dependents
                      .map((d) => `${d.first_name} ${d.last_name}`)
                      .join(", ")}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Profiles on account */}
      <section
        className="mb-8 rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h2
          className="font-heading text-xl font-semibold mb-4"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Profiles on this account
        </h2>
        {account.profiles.length === 0 ? (
          <p className="text-sm" style={{ color: "#6ab04c" }}>
            No profiles on this account yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {account.profiles.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border px-4 py-3 text-sm"
                style={{
                  backgroundColor: "#0f2614",
                  borderColor: p.is_primary ? "#c4973a" : "#2d6b35",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold" style={{ color: "#ffffff" }}>
                    {p.first_name} {p.last_name}
                    {p.is_primary && (
                      <span
                        className="ml-2 text-xs"
                        style={{ color: "#c4973a" }}
                      >
                        (primary)
                      </span>
                    )}
                  </p>
                  <ProfileEditTrigger accountId={accountId} profile={p} />
                </div>
                <p className="text-xs mt-0.5" style={{ color: "#e8d5a3" }}>
                  DOB {p.date_of_birth} · {p.biological_sex}
                </p>
                {p.phone && (
                  <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                    {p.phone}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Orders */}
      <section
        className="mb-8 rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <h2
            className="font-heading text-xl font-semibold flex items-center gap-2"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <Package className="w-5 h-5" style={{ color: "#c4973a" }} />
            Orders <span style={{ color: "#c4973a" }}>({orders.length})</span>
          </h2>
          <Link
            href={`/admin/orders?patient_id=${accountId}`}
            className="text-xs underline"
            style={{ color: "#e8d5a3" }}
          >
            Open in Orders module →
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm" style={{ color: "#6ab04c" }}>
            No orders on this account yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr
                  className="text-xs uppercase tracking-wider text-left"
                  style={{ color: "#6ab04c", borderBottom: "1px solid #2d6b35" }}
                >
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Placed</th>
                  <th className="py-2 pr-3">Collected</th>
                  <th className="py-2 pr-3">Tests</th>
                  <th className="py-2 pr-3">Patient</th>
                  <th className="py-2 pr-3">Shipped</th>
                  <th className="py-2 pr-3">Tracking</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const statusColor = statusColorFor(o.status);
                  return (
                    <tr
                      key={o.id}
                      style={{ borderBottom: "1px solid rgba(45,107,53,0.4)" }}
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/admin/orders?patient_id=${accountId}`}
                          className="font-mono text-xs underline"
                          style={{ color: "#c4973a" }}
                          title={o.id}
                        >
                          {o.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="py-2 pr-3" style={{ color: "#e8d5a3" }}>
                        {formatDate(o.created_at)}
                      </td>
                      <td className="py-2 pr-3" style={{ color: "#e8d5a3" }}>
                        {o.collection_at ? formatDate(o.collection_at) : "—"}
                      </td>
                      <td
                        className="py-2 pr-3"
                        style={{ color: "#ffffff", maxWidth: 360 }}
                      >
                        {o.tests.length === 0 ? (
                          <span style={{ color: "#6ab04c" }}>—</span>
                        ) : (
                          o.tests.join(", ")
                        )}
                      </td>
                      <td className="py-2 pr-3" style={{ color: "#e8d5a3" }}>
                        {o.patients.length === 0 ? "—" : o.patients.join(", ")}
                      </td>
                      <td className="py-2 pr-3" style={{ color: "#e8d5a3" }}>
                        {o.shipped_at ? formatDate(o.shipped_at) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {o.fedex_tracking_number ? (
                          <a
                            href={`https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(o.fedex_tracking_number)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs inline-flex items-center gap-1 underline"
                            style={{ color: "#c4973a" }}
                          >
                            {o.fedex_tracking_number}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span style={{ color: "#6ab04c" }}>—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3" style={{ color: "#e8d5a3" }}>
                        {o.total_cad == null
                          ? "—"
                          : `$${o.total_cad.toFixed(2)}`}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize"
                          style={{
                            backgroundColor: statusColor.bg,
                            color: statusColor.fg,
                            borderColor: statusColor.fg,
                          }}
                        >
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Results repository */}
      <PatientResultsRepository
        accountId={accountId}
        profiles={account.profiles.map((p) => ({
          id: p.id,
          label: `${p.first_name} ${p.last_name}${p.is_primary ? " (primary)" : ""}`,
        }))}
        initialResults={results}
      />
    </div>
  );
}
