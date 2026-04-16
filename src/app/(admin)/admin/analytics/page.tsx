import { createServiceRoleClient } from "@/lib/supabase/server";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = createServiceRoleClient();

  // Fetch all organizations for org breakdown
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .order("name");

  return (
    <AnalyticsDashboard
      organizations={(orgs ?? []) as { id: string; name: string; slug: string }[]}
    />
  );
}
