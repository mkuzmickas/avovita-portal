-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 019: Rename handling_type → ship_temp (and archive legacy names)
-- ═══════════════════════════════════════════════════════════════════════════════
-- The column introduced as `handling_type` in migration 017 is really a
-- shipping-temperature requirement, so it's being renamed to `ship_temp`
-- before the manual Mayo-catalogue backfill starts accruing rows around
-- the misleading name.
--
-- Two legacy columns are already squatting on candidate names:
--   • tests.ship_temp         — original freeform text (migration 001)
--   • tests.ship_temperature  — intermediate enum     (migration 015)
-- Both were kept as backfill sources. They're renamed here to `_legacy_*`
-- so `ship_temp` is free for the canonical column. They stay in the
-- table until the manual backfill pass is verified complete, then a
-- follow-up migration drops them.
--
-- Zero rows are modified; the four renames touch catalog entries only.
-- Check constraints + partial indexes that reference the renamed column
-- track the rename automatically (they store column references by oid,
-- not by name).

-- ── 1. Archive legacy columns so their names are free ─────────────────
alter table public.tests
  rename column ship_temp to ship_temp_legacy_freeform;

alter table public.tests
  rename column ship_temperature to ship_temperature_legacy_enum;

-- ── 2. Rename the canonical column to its accurate name ──────────────
alter table public.tests rename column handling_type to ship_temp;

-- ── 3. Rename the backing enum type to match ─────────────────────────
-- Verified in migration 017: the type is named `handling_type_enum`.
alter type handling_type_enum rename to ship_temp_enum;

-- ── 4. Rename the partial index so its name reflects the new column ──
alter index if exists public.idx_tests_missing_handling
  rename to idx_tests_missing_ship_temp;
