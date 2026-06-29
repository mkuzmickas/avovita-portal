import { redirect } from "next/navigation";

/**
 * Stale URL kept alive for any cached link in customer inboxes that
 * still points here. Magic-link sign-in was retired in favour of
 * mandatory passwords at checkout; the only meaningful recovery is
 * the password-reset flow.
 */
export default function LinkExpiredPage() {
  redirect("/forgot-password");
}
