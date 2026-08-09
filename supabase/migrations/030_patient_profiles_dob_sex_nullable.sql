-- Migration 030: Make patient_profiles identity fields nullable.
--
-- Prior to this migration, date_of_birth and biological_sex were both
-- NOT NULL and had to be captured at checkout (Step 3), before the
-- customer paid. Combined with street/city/province (which moved to
-- postal-code-only in Phase 1) and per-person name capture, Step 3
-- was the biggest source of pre-payment friction — plausible
-- contributor to the 81% checkout drop-off.
--
-- Post-migration, the webhook inserts profile rows immediately after
-- payment with NULL name/DOB/sex fields. PostPurchaseOnboarding is
-- gated on the customer filling all three per person before they can
-- proceed to book their FloLabs collection slot. The FloLabs
-- requisition email (which needs DOB/sex to be useful) now fires
-- from the profile-completion endpoint rather than the payment
-- webhook, so it goes out with populated fields.
--
-- Existing rows all have populated values — this migration only
-- relaxes the NOT NULL constraints so new rows can be inserted
-- without them. Backfilling / cleanup of empty rows happens
-- naturally as customers complete onboarding.

alter table public.patient_profiles
  alter column date_of_birth drop not null;

alter table public.patient_profiles
  alter column biological_sex drop not null;

-- first_name / last_name were already text NOT NULL; loosening those
-- too so a webhook can insert a placeholder row with just the account
-- link. Customer fills them in via ProfileForm during onboarding.
alter table public.patient_profiles
  alter column first_name drop not null;

alter table public.patient_profiles
  alter column last_name drop not null;

-- Convenience view: rows still awaiting profile completion. Admin can
-- see at a glance which orders have profiles that haven't been filled
-- in yet, in case a customer stalls before booking.
create or replace view public.patient_profiles_incomplete as
select
  pp.id,
  pp.account_id,
  pp.created_at,
  pp.date_of_birth is null           as missing_dob,
  pp.biological_sex is null          as missing_sex,
  (pp.first_name is null or
   pp.first_name = '')               as missing_first_name,
  (pp.last_name is null or
   pp.last_name = '')                as missing_last_name
from public.patient_profiles pp
where
  pp.date_of_birth is null
  or pp.biological_sex is null
  or pp.first_name is null
  or pp.first_name = ''
  or pp.last_name is null
  or pp.last_name = '';
