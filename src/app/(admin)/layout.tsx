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

  if (!user) redirect("/login?redirectTo=/admin&msg=admin_required");

  const { data: account } = (await supabase
    .from("accounts")
    .select("email, role")
    .eq("id", user.id)
    .single()) as {
    data: Pick<Account, "email" | "role"> | null;
    error: unknown;
  };

  // Two roles are allowed through this layout:
  //   'admin'           → full portal access (default behavior)
  //   'calendar_viewer' → scoped access for FloLabs staff — sees only
  //                       /admin/calendar. Any other path bounces them
  //                       back to the calendar, so they cannot reach
  //                       orders / patients / financials even by URL.
  const allowedRoles = new Set(["admin", "calendar_viewer"]);
  if (!account || !allowedRoles.has(account.role)) {
    redirect("/portal?msg=admin_required");
  }

  // Path-based route restriction for calendar_viewer is enforced in
  // middleware.ts at the project root (reads the role from a header
  // set at login and bounces non-calendar admin URLs). Sidebar also
  // hides non-calendar links so the user has no visible nav.

  // Live pending results count for the sidebar gold badge
  const service = createServiceRoleClient();
  const pendingResultsCount = await getPendingResultsCount(service);

  return (
    <AdminShell
      email={account.email ?? user.email ?? ""}
      role={account.role}
      pendingResultsCount={pendingResultsCount}
    >
      {children}
    </AdminShell>
  );
}
