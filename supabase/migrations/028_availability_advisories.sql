-- =============================================================================
-- 028_availability_advisories.sql
--
-- Time-boxed advisory rows (holiday closures, phlebotomist coverage
-- gaps, weather disruptions) that surface on the CartBar and the
-- checkout appointment step. Previously the copy + date range were
-- hardcoded in CatalogueClient with an auto-hide-after Date check;
-- the values only came out of the client bundle on redeploy so any
-- date change required Mike to open the repo. This table lets admins
-- queue up windows in advance and edit copy without touching code.
--
-- Rendering logic:
--   * Fetch active rows (active_from <= now <= active_until).
--   * If multiple, take the most recently created — one message on
--     screen is the honest UX; overlapping advisories mean someone
--     didn't archive last month's row.
--   * When no active row, render nothing.
--
-- Deliberately no per-page column: the CartBar and checkout page each
-- render the advisory when appropriate to their own audience. If we
-- ever need per-surface scoping we add a `surfaces text[]` column,
-- but shipping without it — every advisory that's active shows on
-- every surface that renders advisories — is simpler and hasn't
-- caused a real problem yet.
-- =============================================================================

create table if not exists public.availability_advisories (
  id           uuid primary key default gen_random_uuid(),
  -- Customer-facing copy. Kept short — this is inline in a cart bar
  -- and above a booking iframe. Full paragraphs belong somewhere else.
  message      text not null,
  -- Optional emphasized title / eyebrow ("Holiday hours", "Reduced
  -- coverage"). Null falls back to a generic "Important:" prefix in
  -- the UI.
  headline     text,
  active_from  timestamptz not null,
  active_until timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint availability_advisory_active_range
    check (active_until > active_from)
);

create index if not exists idx_availability_advisories_active
  on public.availability_advisories (active_from, active_until);

alter table public.availability_advisories enable row level security;

-- Read: public. This is customer-facing copy — anyone hitting the
-- portal can see it. No sensitive data lives on the row.
create policy availability_advisories_public_read
  on public.availability_advisories
  for select
  using (true);

-- Write: admin only. The application layer enforces admin role on the
-- accounts row, but RLS makes sure a stolen anon key can't post copy
-- to the front door.
create policy availability_advisories_admin_write
  on public.availability_advisories
  for all
  using (
    exists (
      select 1 from public.accounts
      where accounts.id = auth.uid()
        and accounts.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.accounts
      where accounts.id = auth.uid()
        and accounts.role = 'admin'
    )
  );

-- Seed the currently-shipping August 3–16 window so /tests behaviour
-- stays identical the moment this migration runs. Idempotent — a
-- second run of the migration won't duplicate.
insert into public.availability_advisories (message, headline, active_from, active_until)
select
  'Appointment availability is very limited between August 3 and August 16. We recommend booking for August 17 or later.',
  'Limited appointment availability',
  '2026-08-03T00:00:00-06:00',
  '2026-08-17T00:00:00-06:00'
where not exists (
  select 1 from public.availability_advisories
  where active_from = '2026-08-03T00:00:00-06:00'
    and active_until = '2026-08-17T00:00:00-06:00'
);
