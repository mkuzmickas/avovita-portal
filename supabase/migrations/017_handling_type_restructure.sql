-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 017: Handling type restructure
-- ═══════════════════════════════════════════════════════════════════════════════
-- Collapses three overlapping fields (ship_temp freeform, ship_temperature
-- enum, stability_days scalar) into one structured schema backed by an
-- enum + a secondary "frozen stability" column for tests that can ship
-- either refrigerated or frozen.
--
-- This migration INTENTIONALLY does not:
--   • drop `ship_temp` or `ship_temperature` — both stay as read-only
--     fallbacks until the Mayo-catalogue backfill verifies the new data.
--   • backfill any rows — `handling_type` and `stability_days_frozen`
--     start NULL for every existing test and are flagged as missing in
--     the UI until set manually.

create type handling_type_enum as enum (
  'refrigerated_only',
  'frozen_only',
  'ambient_only',
  'refrigerated_or_frozen'
);

alter table public.tests
  add column if not exists handling_type handling_type_enum,
  add column if not exists stability_days_frozen integer;

-- Invariant: stability_days_frozen is only set when handling_type is
-- refrigerated_or_frozen, and is required when it is. NULL handling_type
-- is still permitted (means "not yet set") but cannot carry a frozen
-- value.
alter table public.tests
  drop constraint if exists stability_days_frozen_logic;

alter table public.tests
  add constraint stability_days_frozen_logic check (
    (
      handling_type = 'refrigerated_or_frozen'
      and stability_days_frozen is not null
    )
    or (
      handling_type is distinct from 'refrigerated_or_frozen'
      and stability_days_frozen is null
    )
  );

-- Positivity check — negative or zero stability days are never valid.
alter table public.tests
  drop constraint if exists stability_days_positive;
alter table public.tests
  add constraint stability_days_positive check (
    stability_days is null or stability_days > 0
  );

alter table public.tests
  drop constraint if exists stability_days_frozen_positive;
alter table public.tests
  add constraint stability_days_frozen_positive check (
    stability_days_frozen is null or stability_days_frozen > 0
  );

-- Drop the old partial index from migration 015 and replace with one
-- that reflects the new "missing" definition.
drop index if exists idx_tests_missing_stability_or_handling;

create index if not exists idx_tests_missing_handling on public.tests (id)
  where
    handling_type is null
    or stability_days is null
    or (
      handling_type = 'refrigerated_or_frozen'
      and stability_days_frozen is null
    );
