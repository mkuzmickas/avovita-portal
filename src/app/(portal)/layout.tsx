import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortalSidebar } from "@/components/portal/Sidebar";
import { MobileBottomNav } from "@/components/portal/MobileBottomNav";
import type { Account, PatientProfile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?returnUrl=/portal");
  }

  // Fetch account + primary profile + unviewed-results count in parallel
  const [
    { data: accountRaw },
    { data: primaryProfileRaw },
    { data: profileIdsRaw },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("email, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("patient_profiles")
      .select("first_name")
      .eq("account_id", user.id)
      .eq("is_primary", true)
      .maybeSingle(),
    supabase
      .from("patient_profiles")
      .select("id")
      .eq("account_id", user.id),
  ]);

  const account = accountRaw as Pick<Account, "email" | "role"> | null;
  const primaryProfile = primaryProfileRaw as Pick<
    PatientProfile,
    "first_name"
  > | null;
  const profileIds = ((profileIdsRaw ?? []) as Array<{ id: string }>).map(
    (p) => p.id
  );

  // Count unviewed results across every profile on the account
  let unviewedResultsCount = 0;
  if (profileIds.length > 0) {
    const { count } = await supabase
      .from("results")
      .select("id", { count: "exact", head: true })
      .in("profile_id", profileIds)
      .is("viewed_at", null);
    unviewedResultsCount = count ?? 0;
  }

  const email = account?.email ?? user.email ?? "";
  const displayName = primaryProfile?.first_name ?? email;

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0a1a0d" }}>
      <PortalSidebar
        displayName={displayName}
        email={email}
        unviewedResultsCount={unviewedResultsCount}
      />
      <main className="flex-1 min-w-0 overflow-auto pb-20 md:pb-0">
        {children}
      </main>
      <MobileBottomNav unviewedResultsCount={unviewedResultsCount} />
    </div>
  );
}
