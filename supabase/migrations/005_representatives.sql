-- =============================================================================
-- 005_representatives.sql
--
-- Dependent / representative ordering. Lets a caregiver or POA place
-- an order on behalf of a client (e.g. Always Best Care attending to a
-- senior resident). The account holder is the *representative*; each
-- dependent client is their own patient_profile tagged with is_dependent,
-- relationship, and a POA confirmation timestamp.
--
-- Backwards compatible: every column defaults to false/null so existing
-- single-person accounts keep working exactly as before.
-- =============================================================================

ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS is_dependent boolean DEFAULT false;
ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS relationship text;
ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS poa_confirmed boolean DEFAULT false;
ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS poa_confirmed_at timestamptz;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_representative boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_dependent
  ON public.patient_profiles (is_dependent) WHERE is_dependent = true;
CREATE INDEX IF NOT EXISTS idx_accounts_is_rep
  ON public.accounts (is_representative) WHERE is_representative = true;
