import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, Calendar } from "lucide-react";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PatientResultsRepository } from "@/components/admin/PatientResultsRepository";
import type { AdminPatientProfile } from "@/app/(admin)/admin/patients/page";

export const dynamic = "force-dynamic";

export type PatientRepositoryResult = {
  id: string;
  file_name: string;
  uploaded_at: string;
  profile_id: string;
  profile_label: string;
  source: "manual_upload" | "patient_upload";
};

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

  // Pull manual-upload results for this account's profiles
  const { data: resultsRaw } =
    profileIds.length === 0
      ? { data: [] }
      : await service
          .from("results")
          .select("id, file_name, uploaded_at, profile_id, source")
          .in("source", ["manual_upload", "patient_upload"])
          .in("profile_id", profileIds)
          .order("uploaded_at", { ascending: false });

  const results: PatientRepositoryResult[] = (
    (resultsRaw ?? []) as unknown as Array<{
      id: string;
      file_name: string;
      uploaded_at: string;
      profile_id: string;
      source: "manual_upload" | "patient_upload";
    }>
  ).map((r) => ({
    id: r.id,
    file_name: r.file_name,
    uploaded_at: r.uploaded_at,
    profile_id: r.profile_id,
    profile_label: profileLabelById.get(r.profile_id) ?? "—",
    source: r.source,
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
