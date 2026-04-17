-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 011: Resources Module (Phase R1)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds digital resources (PDFs):
--   1. resources table
--   2. resource_purchases table (download token tracking)
--   3. RLS policies
--   4. updated_at trigger
--   5. Alter order_lines to support resource line items
--   6. Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. resources table ─────────────────────────────────────────────────────

create table if not exists public.resources (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  price_cad        numeric(10,2) not null default 0,
  file_path        text not null,
  file_size_bytes  bigint,
  file_type        text not null default 'application/pdf',
  page_count       integer,
  cover_image_url  text,
  active           boolean not null default true,
  featured         boolean not null default false,
  download_count   integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── 2. resource_purchases table ────────────────────────────────────────────

create table if not exists public.resource_purchases (
  id              uuid primary key default gen_random_uuid(),
  resource_id     uuid not null references public.resources(id),
  order_id        uuid references public.orders(id),
  account_id      uuid references public.accounts(id),
  email           text not null,
  download_token  text unique not null,
  download_count  integer not null default 0,
  max_downloads   integer not null default 5,
  expires_at      timestamptz not null default (now() + interval '30 days'),
  created_at      timestamptz not null default now()
);

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────

alter table public.resources enable row level security;
alter table public.resource_purchases enable row level security;

-- Resources: public can read metadata of active resources.
create policy "resources_public_read"
  on public.resources for select
  using (active = true);

-- Resources: admin full access.
create policy "resources_admin_all"
  on public.resources for all
  using (public.is_admin())
  with check (public.is_admin());

-- Resource purchases: no public read — server-only via service role.
-- Admin full access for management.
create policy "resource_purchases_admin_all"
  on public.resource_purchases for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── 4. updated_at trigger ──────────────────────────────────────────────────

drop trigger if exists resources_updated_at on public.resources;
create trigger resources_updated_at
  before update on public.resources
  for each row execute procedure public.handle_updated_at();

-- ─── 5. Alter order_lines for resource support ──────────────────────────────

-- 5a. Add resource FK column.
alter table public.order_lines
  add column if not exists resource_id uuid references public.resources(id);

-- 5b. Drop and recreate line_type CHECK to include 'resource'.
alter table public.order_lines
  drop constraint if exists order_lines_line_type_check;

alter table public.order_lines
  add constraint order_lines_line_type_check
  check (line_type in ('test', 'supplement', 'resource'));

-- 5c. Drop and recreate the compound FK CHECK to include resource lines.
alter table public.order_lines
  drop constraint if exists order_lines_type_fk_check;

alter table public.order_lines
  add constraint order_lines_type_fk_check
  check (
    (line_type = 'test'       and test_id is not null)
    or
    (line_type = 'supplement' and supplement_id is not null)
    or
    (line_type = 'resource'   and resource_id is not null)
  );

-- ─── 6. Indexes ─────────────────────────────────────────────────────────────

create index if not exists idx_resources_active        on public.resources(active);
create index if not exists idx_resources_featured      on public.resources(featured);
create index if not exists idx_resource_purchases_resource_id
  on public.resource_purchases(resource_id);
create index if not exists idx_resource_purchases_token
  on public.resource_purchases(download_token);
create index if not exists idx_resource_purchases_email
  on public.resource_purchases(email);
create index if not exists idx_order_lines_resource_id
  on public.order_lines(resource_id);
