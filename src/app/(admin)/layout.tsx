import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";
import { getPendingResultsCount } from "@/lib/admin-stats";
import type { Account } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/admin");

  const { data: account } = (await supabase
    .from("accounts")
    .select("email, role")
    .eq("id", user.id)
    .single()) as {
    data: Pick<Account, "email" | "role"> | null;
    error: unknown;
  };

  if (!account || account.role !== "admin") redirect("/portal");

  // Live pending results count for the sidebar gold badge
  const service = createServiceRoleClient();
  const pendingResultsCount = await getPendingResultsCount(service);

  return (
    <AdminShell
      email={account.email ?? user.email ?? ""}
      pendingResultsCount={pendingResultsCount}
    >
      {children}
    </AdminShell>
  );
}
