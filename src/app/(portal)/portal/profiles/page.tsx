import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { User, Plus, Baby, CheckCircle } from "lucide-react";
import Link from "next/link";
import type { PatientProfile } from "@/types/database";

export default async function ProfilesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/portal/profiles");

  const { data: profilesRaw } = await supabase
    .from("patient_profiles")
    .select("*")
    .eq("account_id", user.id)
    .order("is_primary", { ascending: false });
  const profiles = (profilesRaw ?? []) as PatientProfile[];

  const profileIds = profiles.map((p) => p.id);

  const { data: consentsRaw } = await supabase
    .from("consents")
    .select("profile_id, consent_type")
    .in("profile_id", profileIds);
  const consents = (consentsRaw ?? []) as Array<{
    profile_id: string | null;
    consent_type: string;
  }>;

  const consentsByProfile = new Map<string, Set<string>>();
  for (const consent of consents) {
    const pid = consent.profile_id ?? "";
    if (!consentsByProfile.has(pid)) consentsByProfile.set(pid, new Set());
    consentsByProfile.get(pid)!.add(consent.consent_type);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6 sm:mb-8 flex items-start justify-between gap-4">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            My <span style={{ color: "#c4973a" }}>Profiles</span>
          </h1>
          <p className="mt-1" style={{ color: "#e8d5a3" }}>
            Manage patient profiles. Each profile can have separate tests and results.
          </p>
        </div>
        <Link
          href="/portal/profiles/new"
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shrink-0 transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <Plus className="w-4 h-4" />
          Add Profile
        </Link>
      </div>

      <div className="space-y-4">
        {profiles.map((profile) => {
          const profileConsents = consentsByProfile.get(profile.id);
          const hasPipa = profileConsents?.has("general_pipa");

          return (
            <div
              key={profile.id}
              className="rounded-xl border p-6"
              style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-bold"
                  style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                >
                  {profile.first_name[0]}
                  {profile.last_name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2
                      className="font-semibold"
                      style={{ color: "#ffffff" }}
                    >
                      {profile.first_name} {profile.last_name}
                    </h2>
                    {profile.is_primary && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: "rgba(196, 151, 58, 0.125)",
                          color: "#c4973a",
                          borderColor: "#c4973a",
                        }}
                      >
                        Primary
                      </span>
                    )}
                    {profile.is_minor && (
                      <span
                        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: "rgba(141, 198, 63, 0.125)",
                          color: "#8dc63f",
                          borderColor: "#8dc63f",
                        }}
                      >
                        <Baby className="w-3 h-3" />
                        Minor
                      </span>
                    )}
                  </div>

                  <div
                    className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm"
                    style={{ color: "#e8d5a3" }}
                  >
                    <div>
                      <span style={{ color: "#6ab04c" }}>DOB: </span>
                      {formatDate(profile.date_of_birth)}
                    </div>
                    <div>
                      <span style={{ color: "#6ab04c" }}>Sex: </span>
                      {profile.biological_sex.charAt(0).toUpperCase() +
                        profile.biological_sex.slice(1)}
                    </div>
                    {profile.phone && (
                      <div>
                        <span style={{ color: "#6ab04c" }}>Phone: </span>
                        {profile.phone}
                      </div>
                    )}
                    {profile.address_line1 && (
                      <div className="col-span-2 truncate">
                        <span style={{ color: "#6ab04c" }}>Address: </span>
                        {[
                          profile.address_line1,
                          profile.address_line2,
                          profile.city,
                          profile.province,
                          profile.postal_code,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-xs">
                    {hasPipa ? (
                      <>
                        <CheckCircle
                          className="w-3.5 h-3.5"
                          style={{ color: "#8dc63f" }}
                        />
                        <span style={{ color: "#8dc63f" }}>
                          PIPA consent on file
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className="w-3.5 h-3.5 rounded-full border-2 inline-block"
                          style={{ borderColor: "#6ab04c" }}
                        />
                        <span style={{ color: "#6ab04c" }}>
                          No PIPA consent recorded
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <Link
                  href={`/portal/profiles/${profile.id}/edit`}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors shrink-0"
                  style={{
                    color: "#e8d5a3",
                    borderColor: "#2d6b35",
                    backgroundColor: "transparent",
                  }}
                >
                  Edit
                </Link>
              </div>
            </div>
          );
        })}

        {profiles.length === 0 && (
          <div
            className="rounded-xl border px-6 py-16 text-center"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <User
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: "#2d6b35" }}
            />
            <p style={{ color: "#e8d5a3" }}>No profiles yet.</p>
            <p className="text-sm mt-1" style={{ color: "#6ab04c" }}>
              Create your patient profile to start ordering lab tests.
            </p>
          </div>
        )}
      </div>

      {profiles.length > 0 && (
        <p className="text-xs mt-6 text-center" style={{ color: "#6ab04c" }}>
          To remove a profile, please contact AvoVita support at{" "}
          <a
            href="mailto:support@avovita.ca"
            className="underline"
            style={{ color: "#c4973a" }}
          >
            support@avovita.ca
          </a>
          .
        </p>
      )}
    </div>
  );
}
