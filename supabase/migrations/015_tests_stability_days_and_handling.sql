-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 015: Add stability_days + ship_temperature to tests
-- ═══════════════════════════════════════════════════════════════════════════════
-- stability_days quantifies how many days a specimen remains viable from
-- collection to lab arrival. ship_temperature is the strictly-enumerated
-- handling/temperature requirement used by quote-composer logic to compute
-- the strictest handling across a cart.
--
-- Both fields are intentionally nullable and have NO default — missing data
-- must remain visibly missing so the admin team can audit and fill it in
-- deliberately. The existing freeform `ship_temp` column is left untouched
-- for backward compatibility (requisitions, catalogue display).

alter table public.tests
  add column if not exists stability_days integer;

alter table public.tests
  add column if not exists ship_temperature text;

alter table public.tests
  drop constraint if exists tests_ship_temperature_check;

alter table public.tests
  add constraint tests_ship_temperature_check
  check (
    ship_temperature is null
    or ship_temperature in ('ambient', 'refrigerated', 'frozen', 'warm_37c', 'cold_chain')
  );

-- Index to make the "missing data" admin filter fast even once the
-- catalogue grows.
create index if not exists idx_tests_missing_stability_or_handling
  on public.tests (id)
  where stability_days is null or ship_temperature is null;
