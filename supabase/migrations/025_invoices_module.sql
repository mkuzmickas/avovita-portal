-- =============================================================================
-- 025_invoices_module.sql
--
-- Invoices feature foundation (Phase 1 of the Invoices build):
--
--   • accounts.stripe_customer_id — lazily populated the first time we
--     create a Stripe object for that account so reused invoices
--     attach to the same customer.
--   • invoice_number_seq — Postgres sequence backing the "AVO-0001"
--     human-readable invoice numbers. Race-safe; the DB guarantees
--     uniqueness so we never collide under concurrent admin clicks.
--     Starts at 1, no annual reset; the application formatter handles
--     >9999 gracefully (LPAD switches to natural length).
--   • invoices — header row per invoice (one row per AVO-XXXX).
--   • invoice_line_items — child rows; cascade-deleted with parent.
--   • orders.order_type — discriminator. Default 'tests' for the
--     historical collection-and-tests order; 'products' is created by
--     Phase 2 webhook when a Flow B (standalone) invoice gets paid,
--     so customers see the purchase in their portal Orders list.
--   • order_lines.payment_status — per-line paid/unpaid/refunded so a
--     Flow A amendment can attach new test lines that aren't yet paid
--     and flip them to 'paid' on webhook receipt.
--   • Safety-guarded backfill: every existing order row gets
--     order_type='tests', every existing order_lines row gets
--     payment_status='paid'. WHERE clauses only update where currently
--     NULL so re-running the migration is idempotent.
--
-- No RLS changes here. The application layer enforces admin-only
-- access through the same `accounts.role = 'admin'` check that every
-- other admin route uses; Phase 2 will wire the routes.
-- =============================================================================

-- ─── 1a. Stripe Customer lazy link ────────────────────────────────────────
alter table public.accounts
  add column if not exists stripe_customer_id text;

-- ─── 1b. Invoice number sequence ──────────────────────────────────────────
create sequence if not exists public.invoice_number_seq
  start with 1
  increment by 1
  no maxvalue
  no cycle;

-- ─── 1c. Invoices ─────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id                          uuid primary key default gen_random_uuid(),
  invoice_number              text not null unique,
  account_id                  uuid not null references public.accounts(id) on delete restrict,
  profile_id                  uuid references public.patient_profiles(id) on delete set null,
  order_id                    uuid references public.orders(id) on delete set null,
  invoice_type                text not null check (invoice_type in ('products','order_amendment')),
  stripe_invoice_id           text unique,
  stripe_payment_intent_id    text,
  stripe_hosted_invoice_url   text,
  status                      text not null default 'draft'
                                check (status in ('draft','sent','paid','void')),
  subtotal_cad                numeric(10,2) not null,
  tax_cad                     numeric(10,2) not null,
  total_cad                   numeric(10,2) not null,
  sent_at                     timestamptz,
  paid_at                     timestamptz,
  created_by                  uuid not null references public.accounts(id) on delete restrict,
  admin_notes                 text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_invoices_account_id on public.invoices(account_id);
create index if not exists idx_invoices_order_id on public.invoices(order_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_stripe_invoice_id on public.invoices(stripe_invoice_id);

-- ─── 1d. Invoice line items ──────────────────────────────────────────────
create table if not exists public.invoice_line_items (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  line_type         text not null check (line_type in ('test','supplement','service','custom','shipping','discount')),
  test_id           uuid references public.tests(id) on delete set null,
  supplement_id     uuid references public.supplements(id) on delete set null,
  description       text not null,
  quantity          integer not null default 1 check (quantity > 0),
  unit_price_cad    numeric(10,2) not null,
  line_total_cad    numeric(10,2) not null,
  admin_notes       text,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists idx_invoice_lines_invoice_id on public.invoice_line_items(invoice_id);

-- ─── 1e. order_lines.payment_status ──────────────────────────────────────
alter table public.order_lines
  add column if not exists payment_status text;

-- Backfill before we add the constraint so existing rows are valid.
update public.order_lines
   set payment_status = 'paid'
 where payment_status is null;

alter table public.order_lines
  alter column payment_status set default 'paid',
  alter column payment_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'order_lines_payment_status_check'
  ) then
    alter table public.order_lines
      add constraint order_lines_payment_status_check
        check (payment_status in ('paid','unpaid','refunded'));
  end if;
end$$;

-- ─── 1f. orders.order_type ───────────────────────────────────────────────
alter table public.orders
  add column if not exists order_type text;

update public.orders
   set order_type = 'tests'
 where order_type is null;

alter table public.orders
  alter column order_type set default 'tests',
  alter column order_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'orders_order_type_check'
  ) then
    alter table public.orders
      add constraint orders_order_type_check
        check (order_type in ('tests','products'));
  end if;
end$$;

-- ─── 1g. Idempotency safety net for re-runs ──────────────────────────────
-- The UPDATE statements above use WHERE NULL guards, so re-running this
-- file is safe: backfills only touch rows that haven't been backfilled.


-- ─── 1h. RPC: next_invoice_number ────────────────────────────────────────
-- Exposes the invoice_number_seq through PostgREST so the application
-- can pull the next value via supabase.rpc("next_invoice_number").
-- Returns the raw sequence integer; the application zero-pads it to
-- AVO-XXXX. SECURITY DEFINER + revoke-from-public + grant-to-service-
-- role keeps it admin-only.
create or replace function public.next_invoice_number()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('public.invoice_number_seq');
$$;

revoke all on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to service_role;
