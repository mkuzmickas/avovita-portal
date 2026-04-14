-- =============================================================================
-- 003_results_source.sql
--
-- Tag every result row with its origin so the admin Patient Profile
-- repository can distinguish manually-uploaded PDFs from order-attached
-- lab results. Existing rows are all order-attached.
-- =============================================================================

alter table public.results
  add column if not exists source text not null default 'order'
    check (source in ('order', 'manual_upload', 'patient_upload'));

create index if not exists idx_results_source
  on public.results (source);

-- Allow patients to view their own manual-upload results via RLS. The
-- existing "patients can view their own results" policy already covers
-- the normal order-attached path (via profile_id → account_id), so the
-- same policy naturally covers manual uploads that share the same
-- profile_id. No policy change required.

-- Backfill: every row that existed before this migration had order_id set
-- (manual uploads didn't exist yet). The default handles that correctly.
