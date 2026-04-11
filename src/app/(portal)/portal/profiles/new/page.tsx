import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileFormWithConsent } from "@/components/portal/ProfileFormWithConsent";

export default async function NewProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/portal/profiles/new");

  // Determine whether this will be the account's first profile (→ primary)
  const { count: profileCount } = await supabase
    .from("patient_profiles")
    .select("id", { count: "exact", head: true })
    .eq("account_id", user.id);

  const isPrimary = (profileCount ?? 0) === 0;

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
          Add Patient <span style={{ color: "#c4973a" }}>Profile</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Each profile can be a separate patient (e.g. a family member).
        </p>
      </div>
      <div
        className="rounded-2xl border p-6 sm:p-8"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <ProfileFormWithConsent
          accountId={user.id}
          isPrimary={isPrimary}
          requireGeneralConsent={isPrimary}
          redirectAfter="/portal/profiles"
        />
      </div>
    </div>
  );
}
