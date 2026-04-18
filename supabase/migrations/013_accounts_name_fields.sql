-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 013: Add first_name and last_name to accounts table
-- ═══════════════════════════════════════════════════════════════════════════════
-- Collected at signup. Nullable — existing accounts without names are fine
-- (backfilled at first checkout via patient_profiles).

alter table public.accounts
  add column if not exists first_name text,
  add column if not exists last_name text;
