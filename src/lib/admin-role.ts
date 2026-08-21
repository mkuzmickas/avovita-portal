import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";

/**
 * Role-based access model for the admin area.
 *
 *   role = 'admin'            → full portal access (everything)
 *   role = 'admin_viewer'     → sees the full admin UI but cannot mutate.
 *                               Every /api/admin/** route (and /api/orders,
 *                               /api/results, /api/quickbooks) rejects
 *                               anyone whose role !== 'admin', so write
 *                               lockdown is automatic — no per-route
 *                               changes needed.
 *   role = 'calendar_viewer'  → ONLY /admin/calendar (for FloLabs staff
 *                               who need to see the FloLabs collection
 *                               calendar without seeing patient orders,
 *                               financials, etc.)
 *
 * The (admin)/layout allows admin + admin_viewer + calendar_viewer
 * through. Full-admin-only pages call requireFullAdmin() at the top;
 * a calendar_viewer visiting one of those pages is silently redirected
 * to /admin/calendar. admin_viewer passes through requireFullAdmin so
 * they can read every page.
 */

export type AdminRole = "admin" | "admin_viewer" | "calendar_viewer";

export function canSeeFullAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "admin_viewer";
}

export function canSeeCalendar(role: string | null | undefined): boolean {
  return (
    role === "admin" || role === "admin_viewer" || role === "calendar_viewer"
  );
}

export function canWriteAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

/**
 * Server-component guard for pages that require full admin access
 * (read or write). Redirects calendar_viewer users to /admin/calendar;
 * kicks anyone unauthenticated to /login. admin_viewer passes through
 * — write actions on their session are blocked at the API layer.
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
  if (account.role !== "admin" && account.role !== "admin_viewer") {
    redirect("/portal?msg=admin_required");
  }
  return {
    role: account.role as AdminRole,
    email: account.email ?? user.email ?? "",
  };
}
