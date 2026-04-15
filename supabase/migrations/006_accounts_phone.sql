-- =============================================================================
-- 006_accounts_phone.sql
--
-- Representative orders provide the rep's phone alongside their email.
-- The rep isn't a tested patient (no DOB/biological_sex/etc) so we
-- don't create a patient_profiles row for them — their phone lives on
-- the accounts row directly so the ship/results notification paths can
-- reach them via SMS.
-- =============================================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS phone text;
