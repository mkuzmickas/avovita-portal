import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";

/**
 * Role-based access model for the admin area.
 *
 *   role = 'admin'            → full portal access (everything)
 *   role = 'calendar_viewer'  → ONLY /admin/calendar (for FloLabs staff
 *                               who need to see the FloLabs collection
 *                               calendar without seeing patient orders,
 *                               financials, etc.)
 *
 * The (admin)/layout allows either role through. Individual pages
 * that require full admin access call requireFullAdmin() at the top;
 * a calendar_viewer visiting one of those pages is silently redirected
 * to /admin/calendar.
 */

export type AdminRole = "admin" | "calendar_viewer";

export function canSeeFullAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canSeeCalendar(role: string | null | undefined): boolean {
  return role === "admin" || role === "calendar_viewer";
}

/**
 * Server-component guard for pages that require full admin access.
 * Redirects calendar_viewer users to /admin/calendar; kicks anyone
 * unauthenticated to /login.
 */
export async function requireFullAdmin(): Promise<{
  role: AdminRole;
  email: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/admin&msg=admin_required");
  const { data: account } = (await supabase
    .from("accounts")
    .select("email, role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "email" | "role"> | null };
  if (!account) redirect("/portal?msg=admin_required");
  if (account.role === "calendar_viewer") {
    redirect("/admin/calendar");
  }
  if (account.role !== "admin") {
    redirect("/portal?msg=admin_required");
  }
  return {
    role: account.role as AdminRole,
    email: account.email ?? user.email ?? "",
  };
}
