-- Widen accounts.role check constraint to include 'admin_viewer'.
--
-- Motivation: adding a read-only admin tier. admin_viewer sees the
-- full admin UI (same layout as an admin) but every /api/admin/**
-- mutation route rejects anyone whose role !== 'admin', so writes are
-- blocked automatically.
--
-- Migration 001 seeded the constraint as check (role in ('patient',
-- 'admin')). 'calendar_viewer' was added out-of-band (never versioned).
-- This migration replaces the constraint with the current full set of
-- four roles so future readers see the truth in one place.

alter table public.accounts
  drop constraint if exists accounts_role_check;

alter table public.accounts
  add constraint accounts_role_check
    check (role in ('patient', 'admin', 'admin_viewer', 'calendar_viewer'));
