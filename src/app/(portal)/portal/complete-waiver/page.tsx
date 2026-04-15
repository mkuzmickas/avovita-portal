import { redirect } from "next/navigation";
import { Leaf } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CompleteWaiverClient } from "./CompleteWaiverClient";

export const dynamic = "force-dynamic";

export default async function CompleteWaiverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/portal/complete-waiver");

  const [{ data: accountRaw }, { data: profilesRaw }] = await Promise.all([
    supabase
      .from("accounts")
      .select("is_representative")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("patient_profiles")
      .select("first_name, last_name, is_dependent, relationship")
      .eq("account_id", user.id),
  ]);

  const account = accountRaw as { is_representative: boolean | null } | null;
  const profiles =
    (profilesRaw ?? []) as Array<{
      first_name: string;
      last_name: string;
      is_dependent: boolean | null;
      relationship: string | null;
    }>;

  const dependents = profiles.filter((p) => p.is_dependent);
  const isRepresentative =
    !!account?.is_representative && dependents.length > 0;
  const representativeRelationship =
    dependents.find((d) => d.relationship)?.relationship ?? null;

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center border"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <Leaf className="w-5 h-5" style={{ color: "#8dc63f" }} />
          </div>
          <span
            className="font-heading text-2xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            AvoVita Wellness
          </span>
        </div>

        <div
          className="rounded-2xl border px-5 sm:px-8 py-6 sm:py-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <CompleteWaiverClient
            isRepresentative={isRepresentative}
            dependents={dependents.map((d) => ({
              first_name: d.first_name,
              last_name: d.last_name,
            }))}
            representativeRelationship={representativeRelationship}
          />
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "#6ab04c" }}
        >
          Protected by Alberta PIPA · AvoVita Wellness
        </p>
      </div>
    </div>
  );
}
