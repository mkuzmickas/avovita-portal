-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 010: Supplements Module (Phase 1)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds the supplements product line:
--   1. supplements table (own table, not shared with tests)
--   2. RLS policies matching the tests table pattern
--   3. updated_at trigger via existing handle_updated_at()
--   4. Alter order_lines to support supplement line items
--   5. Alter orders to support supplement fulfillment options
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. supplements table ───────────────────────────────────────────────────

create table if not exists public.supplements (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text unique not null,
  name                text not null,
  description         text,
  price_cad           numeric(10,2) not null,
  cost_cad            numeric(10,2),
  category            text,
  brand               text,
  active              boolean not null default true,
  featured            boolean not null default false,
  track_inventory     boolean not null default false,
  stock_qty           integer not null default 0,
  low_stock_threshold integer not null default 5,
  image_url           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── 2. RLS on supplements ──────────────────────────────────────────────────
-- Mirrors the tests table pattern exactly:
--   • Public read for active rows
--   • Admin full access via is_admin()

alter table public.supplements enable row level security;

create policy "supplements_public_read"
  on public.supplements for select
  using (active = true);

create policy "supplements_admin_all"
  on public.supplements for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── 3. updated_at trigger ──────────────────────────────────────────────────
-- Reuses the existing handle_updated_at() function from migration 001.

drop trigger if exists supplements_updated_at on public.supplements;
create trigger supplements_updated_at
  before update on public.supplements
  for each row execute procedure public.handle_updated_at();

-- ─── 4. Alter order_lines for supplement support ────────────────────────────
-- Current schema: test_id uuid NOT NULL, no line_type column.
-- After: test_id nullable, supplement_id nullable, line_type discriminator,
--        CHECK ensures exactly one FK is set per line_type.

-- 4a. Relax NOT NULL on test_id so supplement lines can leave it null.
alter table public.order_lines
  alter column test_id drop not null;

-- 4b. Add line_type discriminator.
alter table public.order_lines
  add column if not exists line_type text not null default 'test';

alter table public.order_lines
  add constraint order_lines_line_type_check
  check (line_type in ('test', 'supplement'));

-- 4c. Add supplement FK.
alter table public.order_lines
  add column if not exists supplement_id uuid references public.supplements(id);

-- 4d. Ensure exactly one FK is populated per line type.
alter table public.order_lines
  add constraint order_lines_type_fk_check
  check (
    (line_type = 'test'       and test_id is not null)
    or
    (line_type = 'supplement' and supplement_id is not null)
  );

-- 4e. Index on supplement_id for join performance.
create index if not exists idx_order_lines_supplement_id
  on public.order_lines(supplement_id);

-- ─── 5. Alter orders for supplement fulfillment ─────────────────────────────

-- 5a. Flag indicating the order contains at least one supplement line.
alter table public.orders
  add column if not exists has_supplements boolean not null default false;

-- 5b. Fulfillment method chosen at checkout.
--     'shipping'    = $40 flat-rate Canada-wide shipping
--     'coordinated' = customer arranged pickup/delivery offline ($0)
alter table public.orders
  add column if not exists supplement_fulfillment text;

alter table public.orders
  add constraint orders_supplement_fulfillment_check
  check (
    supplement_fulfillment is null
    or supplement_fulfillment in ('shipping', 'coordinated')
  );

-- 5c. Shipping fee paid (0 for coordinated, 40 for shipping, etc.)
alter table public.orders
  add column if not exists supplement_shipping_fee_cad numeric(10,2) not null default 0;

-- 5d. Shipping address (only populated when fulfillment = 'shipping').
-- JSONB with keys: name, street, city, province, postal, country.
alter table public.orders
  add column if not exists supplement_shipping_address jsonb;

-- ─── 6. Indexes on supplements ──────────────────────────────────────────────

create index if not exists idx_supplements_active   on public.supplements(active);
create index if not exists idx_supplements_category on public.supplements(category);
create index if not exists idx_supplements_sku      on public.supplements(sku);
