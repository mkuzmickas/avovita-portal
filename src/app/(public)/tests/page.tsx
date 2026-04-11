import { createClient } from "@/lib/supabase/server";
import { TestCatalogue } from "@/components/TestCatalogue";
import type { TestWithLab } from "@/types/database";

export default async function TestsPage() {
  const supabase = await createClient();

  const { data: tests } = await supabase
    .from("tests")
    .select("*, lab:labs(*)")
    .eq("active", true)
    .order("featured", { ascending: false })
    .order("name", { ascending: true });

  // Fetch profiles if user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profiles: import("@/types/database").PatientProfile[] = [];
  if (user) {
    const { data } = await supabase
      .from("patient_profiles")
      .select("*")
      .eq("account_id", user.id)
      .order("is_primary", { ascending: false });
    profiles = data ?? [];
  }

  const categories = [
    ...new Set(
      (tests ?? [])
        .map((t) => t.category)
        .filter((c): c is string => Boolean(c))
    ),
  ].sort();

  return (
    <TestCatalogue
      tests={(tests ?? []) as unknown as TestWithLab[]}
      profiles={profiles}
      categories={categories}
      isLoggedIn={!!user}
    />
  );
}
