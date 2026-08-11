import { redirect } from "next/navigation";

/**
 * Standalone signup was removed in Aug 2026. Accounts are only
 * created via checkout — a customer who lands on /signup gets
 * redirected to /tests to pick a test first, at which point their
 * account gets created automatically on payment.
 *
 * Route kept as a redirect (not deleted) so any stale bookmarks,
 * search-engine results, or manual URL typing falls through
 * cleanly instead of 404ing. The old signup form was the source
 * of a real bug: it let customers create accounts and sign the
 * portal waiver without ever paying for a test, producing
 * ghost accounts in the admin patients list that had no purchase
 * history but appeared as "signed waiver".
 */
export default function SignupRedirect() {
  redirect("/tests");
}
