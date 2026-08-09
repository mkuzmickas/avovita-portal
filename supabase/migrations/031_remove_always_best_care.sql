-- Migration 031: Remove the Always Best Care org from public.organizations.
--
-- ABC was the only white-label org partner on the portal and Mike has
-- decommissioned the relationship (Aug 2026). This migration:
--
--   1. Nulls out org_id on any historical orders / quotes that were
--      tagged to ABC — the underlying orders are still valid, they
--      just lose the org attribution. Nothing about the customer's
--      order or their patient profile is affected.
--   2. Deletes the ABC row from public.organizations.
--
-- The organizations table itself stays in place — it's generic
-- infrastructure that could support a future white-label partner
-- without a rebuild. With no rows, the /org/[slug]/tests route
-- becomes inert (404 on any slug lookup), the analytics dashboard's
-- Organization Breakdown collapses to just "AvoVita Direct", and
-- the org_id column on orders / quotes is always NULL for new rows.
--
-- Uses slug matching rather than a hardcoded UUID so this migration
-- is idempotent — running it twice is a no-op if the row's already
-- gone, and it works cleanly across any prod / staging / dev
-- database that seeded ABC from migration 004.

do $$
declare
  abc_id uuid;
begin
  select id into abc_id
  from public.organizations
  where slug = 'always-best-care'
  limit 1;

  if abc_id is null then
    raise notice
      '[migration 031] Always Best Care org not found — nothing to remove.';
    return;
  end if;

  -- Detach any orders / quotes tagged to ABC. No FK constraint has
  -- ON DELETE SET NULL configured, so we clear the reference
  -- explicitly before the DELETE below can succeed.
  update public.orders set org_id = null where org_id = abc_id;
  update public.quotes set org_id = null where org_id = abc_id;

  delete from public.organizations where id = abc_id;

  raise notice '[migration 031] Removed Always Best Care org (%)', abc_id;
end $$;
