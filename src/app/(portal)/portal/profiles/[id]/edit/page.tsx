import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ProfileFormWithConsent } from "@/components/portal/ProfileFormWithConsent";
import type { PatientProfile } from "@/types/database";

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?returnUrl=/portal/profiles/${id}/edit`);

  const { data: profileRaw } = await supabase
    .from("patient_profiles")
    .select("*")
    .eq("id", id)
    .eq("account_id", user.id)
    .single();
  const profile = profileRaw as PatientProfile | null;

  if (!profile) notFound();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Edit <span style={{ color: "#c4973a" }}>Profile</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          {profile.first_name} {profile.last_name}
        </p>
      </div>
      <div
        className="rounded-2xl border p-6 sm:p-8"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <ProfileFormWithConsent
          accountId={user.id}
          isPrimary={profile.is_primary}
          redirectAfter="/portal/profiles"
          existingProfile={profile}
        />
      </div>
    </div>
  );
}
