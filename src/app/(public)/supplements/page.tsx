import { redirect } from "next/navigation";

/**
 * Supplements removed from the user-driven experience Oct 2026 (Mike).
 * Still supported server-side as line items in the admin invoicing
 * module so clients can be charged for supplements billed outside
 * the portal, but no longer a browse-and-add surface. Anyone landing
 * here from an old bookmark or search result is redirected to the
 * lab catalogue.
 */
export default function SupplementsPage() {
  redirect("/tests");
}
