-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 012: pending_orders table + order_lines.profile_id nullable
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Part of Phase 4 (unified checkout for tests + supplements + resources):
--
--   1. pending_orders table — stores full cart snapshot pre-payment so
--      Stripe metadata only needs to carry the pending_order_id (avoids
--      the 500-char chunk splitting problem for large mixed carts).
--
--   2. Relax order_lines.profile_id to nullable — supplement and resource
--      lines have no associated patient profile.
--
--   3. Update compound CHECK constraint to enforce profile_id rules per
--      line_type: tests MUST have profile_id, supplements/resources MUST NOT.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. pending_orders table ────────────────────────────────────────────

create table if not exists public.pending_orders (
  id            uuid primary key default gen_random_uuid(),
  payload       jsonb not null,
  fulfilled     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Admin-only access. The Stripe checkout route writes via service role;
-- the webhook reads + marks as fulfilled via service role.
alter table public.pending_orders enable row level security;

create policy "pending_orders_admin_all"
  on public.pending_orders for all
  using (public.is_admin())
  with check (public.is_admin());

-- TTL index: pending_orders older than 30 days can be cleaned up by a
-- future cron job. Not built yet — just the index for efficient queries.
create index if not exists idx_pending_orders_created_at
  on public.pending_orders(created_at);

-- ─── 2. Relax profile_id on order_lines ─────────────────────────────────
-- Supplement and resource lines have no patient profile.
-- Before running this, confirm zero test lines have NULL profile_id:
--   SELECT COUNT(*) FROM order_lines
--   WHERE (line_type IS NULL OR line_type = 'test') AND profile_id IS NULL;
-- Must return 0.

alter table public.order_lines
  alter column profile_id drop not null;

-- ─── 3. Update compound CHECK constraint ────────────────────────────────
-- Drop the old constraint (from migration 011) and recreate with
-- profile_id enforcement per line_type.

alter table public.order_lines
  drop constraint if exists order_lines_type_fk_check;

alter table public.order_lines
  add constraint order_lines_type_fk_check
  check (
    (line_type = 'test'       and test_id is not null       and profile_id is not null)
    or
    (line_type = 'supplement' and supplement_id is not null  and profile_id is null)
    or
    (line_type = 'resource'   and resource_id is not null    and profile_id is null)
  );
