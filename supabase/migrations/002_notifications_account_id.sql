-- =============================================================================
-- 002_notifications_account_id.sql
--
-- Decouple notifications from patient_profiles for system-level events that
-- target an account rather than a specific profile. Use cases:
--   - Email confirmation reminders (per account, no profile yet)
--   - Admin SMS / order broadcast notifications (already inserted with
--     profile_id=null today — these would have been failing the not-null
--     constraint silently inside try/catch blocks)
--
-- Two changes:
--   1. Drop the NOT NULL constraint on profile_id
--   2. Add nullable account_id column with FK to accounts(id)
-- =============================================================================

alter table public.notifications
  alter column profile_id drop not null;

alter table public.notifications
  add column if not exists account_id uuid references public.accounts(id)
    on delete restrict;

create index if not exists idx_notifications_account_id
  on public.notifications (account_id);
create index if not exists idx_notifications_template_account
  on public.notifications (template, account_id, sent_at desc);
