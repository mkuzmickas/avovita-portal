-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 021: accounts.review_request_sent_at
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tracks whether an admin has sent a Google review request to a client. Once
-- non-null, the admin UI greys out the "Send Review Request" button for that
-- client — there's no resend flow.
--
-- Nullable (default null) — most clients haven't been asked yet. The column is
-- on `accounts` (not patient_profiles) because the request goes to the account
-- holder's contact info; one timestamp per client account regardless of how
-- many dependents are under it.

alter table public.accounts
  add column if not exists review_request_sent_at timestamptz;
