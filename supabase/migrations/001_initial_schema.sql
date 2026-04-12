-- =============================================================================
-- AvoVita Patient Portal — Initial Database Schema
-- 2490409 Alberta Ltd. | Alberta PIPA Compliant
-- Run this entire file in the Supabase SQL editor.
--
-- Execution order:
--   1. Extensions
--   2. Tables  (labs → tests → accounts → patient_profiles → consents →
--               orders → order_lines → visit_groups → results → notifications)
--   3. is_admin() helper function
--   4. Row Level Security policies
--   5. Indexes
--   6. updated_at trigger (function + triggers)
--   7. Storage bucket reference note
--   8. Seed data (labs)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── labs ────────────────────────────────────────────────────────────────────
create table if not exists public.labs (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  country              text not null,
  shipping_schedule    text not null check (shipping_schedule in ('weekly_wednesday','same_day','kit_only','other')),
  shipping_notes       text,
  results_visibility   text not null check (results_visibility in ('full','none','partial')),
  turnaround_min_days  integer,
  turnaround_max_days  integer,
  turnaround_notes     text,
  cross_border_country text,
  created_at           timestamptz not null default now()
);

-- ─── tests ───────────────────────────────────────────────────────────────────
create table if not exists public.tests (
  id                  uuid primary key default gen_random_uuid(),
  lab_id              uuid not null references public.labs(id) on delete restrict,
  name                text not null,
  slug                text not null unique,
  description         text,
  category            text,
  price_cad           numeric(10,2) not null,
  turnaround_display  text,
  turnaround_min_days integer,
  turnaround_max_days integer,
  turnaround_note     text,
  specimen_type       text,
  ship_temp           text,
  order_type          text not null default 'standard' check (order_type in ('standard','kit','kit_with_collection')),
  stability_notes     text,
  active              boolean not null default true,
  featured            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── accounts (extends Supabase Auth) ────────────────────────────────────────
create table if not exists public.accounts (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'patient' check (role in ('patient','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: auto-create an accounts row when a new Supabase Auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── patient_profiles ────────────────────────────────────────────────────────
create table if not exists public.patient_profiles (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id) on delete cascade,
  first_name     text not null,
  last_name      text not null,
  date_of_birth  date not null,
  biological_sex text not null check (biological_sex in ('male','female','intersex')),
  phone          text,
  address_line1  text,
  address_line2  text,
  city           text,
  province       text default 'AB',
  postal_code    text,
  is_minor       boolean not null default false,
  is_primary     boolean not null default false,
  relationship   text check (relationship in (
    'account_holder','spouse_partner','child','parent','sibling','friend','colleague','other'
  )),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── consents (append-only — PIPA compliance record) ────────────────────────
create table if not exists public.consents (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid references public.patient_profiles(id) on delete restrict,
  account_id           uuid not null references public.accounts(id) on delete restrict,
  consent_type         text not null check (consent_type in (
    'general_pipa','cross_border_us','cross_border_de','cross_border_ca','collection_authorization'
  )),
  consent_text_version text not null,
  ip_address           text,
  user_agent           text,
  consented_at         timestamptz not null default now()
);

-- ─── orders ──────────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id                       uuid primary key default gen_random_uuid(),
  account_id               uuid not null references public.accounts(id) on delete restrict,
  stripe_payment_intent_id text unique,
  stripe_session_id        text unique,
  status                   text not null default 'pending' check (status in (
    'pending','confirmed','collected','shipped','resulted','complete','cancelled'
  )),
  subtotal_cad             numeric(10,2),
  discount_cad             numeric(10,2) default 0,
  home_visit_fee_cad       numeric(10,2),
  tax_cad                  numeric(10,2),
  total_cad                numeric(10,2),
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ─── order_lines ─────────────────────────────────────────────────────────────
create table if not exists public.order_lines (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  test_id        uuid not null references public.tests(id) on delete restrict,
  profile_id     uuid not null references public.patient_profiles(id) on delete restrict,
  quantity       integer not null default 1,
  unit_price_cad numeric(10,2) not null,
  created_at     timestamptz not null default now()
);

-- ─── visit_groups ────────────────────────────────────────────────────────────
create table if not exists public.visit_groups (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders(id) on delete cascade,
  address_line1           text,
  address_line2           text,
  city                    text,
  province                text,
  postal_code             text,
  base_fee_cad            numeric(10,2) not null default 85.00,
  additional_person_count integer not null default 0,
  additional_fee_cad      numeric(10,2) not null default 0.00,
  total_fee_cad           numeric(10,2) not null,
  created_at              timestamptz not null default now()
);

-- ─── results ─────────────────────────────────────────────────────────────────
create table if not exists public.results (
  id                   uuid primary key default gen_random_uuid(),
  order_line_id        uuid not null references public.order_lines(id) on delete restrict,
  profile_id           uuid not null references public.patient_profiles(id) on delete restrict,
  lab_reference_number text,
  storage_path         text not null,
  file_name            text not null,
  uploaded_by          uuid not null references public.accounts(id) on delete restrict,
  uploaded_at          timestamptz not null default now(),
  notified_at          timestamptz,
  viewed_at            timestamptz,
  created_at           timestamptz not null default now()
);

-- ─── notifications ───────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.patient_profiles(id) on delete restrict,
  order_id      uuid references public.orders(id) on delete restrict,
  result_id     uuid references public.results(id) on delete restrict,
  channel       text not null check (channel in ('email','sms')),
  template      text not null,
  recipient     text not null,
  status        text not null default 'sent' check (status in ('sent','failed')),
  sent_at       timestamptz not null default now(),
  error_message text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. is_admin() HELPER FUNCTION
-- Must be declared AFTER public.accounts exists, BEFORE RLS policies that
-- depend on it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select role = 'admin' from public.accounts where id = auth.uid()),
    false
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.labs              enable row level security;
alter table public.tests             enable row level security;
alter table public.accounts          enable row level security;
alter table public.patient_profiles  enable row level security;
alter table public.consents          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_lines       enable row level security;
alter table public.visit_groups      enable row level security;
alter table public.results           enable row level security;
alter table public.notifications     enable row level security;

-- ─── labs: public read, admin write ──────────────────────────────────────────
create policy "labs_public_read"
  on public.labs for select
  using (true);

create policy "labs_admin_all"
  on public.labs for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── tests: public read, admin write ─────────────────────────────────────────
create policy "tests_public_read"
  on public.tests for select
  using (true);

create policy "tests_admin_all"
  on public.tests for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── accounts: own row only ──────────────────────────────────────────────────
create policy "accounts_own_select"
  on public.accounts for select
  using (auth.uid() = id);

create policy "accounts_own_update"
  on public.accounts for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "accounts_admin_select"
  on public.accounts for select
  using (public.is_admin());

-- ─── patient_profiles ────────────────────────────────────────────────────────
create policy "profiles_own_select"
  on public.patient_profiles for select
  using (account_id = auth.uid());

create policy "profiles_own_insert"
  on public.patient_profiles for insert
  with check (account_id = auth.uid());

create policy "profiles_own_update"
  on public.patient_profiles for update
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "profiles_admin_select"
  on public.patient_profiles for select
  using (public.is_admin());

create policy "profiles_admin_all"
  on public.patient_profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── consents: append-only, own rows ─────────────────────────────────────────
create policy "consents_own_insert"
  on public.consents for insert
  with check (account_id = auth.uid());

create policy "consents_own_select"
  on public.consents for select
  using (account_id = auth.uid());

create policy "consents_admin_select"
  on public.consents for select
  using (public.is_admin());

-- No UPDATE or DELETE policies on consents — intentional PIPA requirement.

-- ─── orders ──────────────────────────────────────────────────────────────────
create policy "orders_own_select"
  on public.orders for select
  using (account_id = auth.uid());

create policy "orders_admin_all"
  on public.orders for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── order_lines: via parent order ───────────────────────────────────────────
create policy "order_lines_own_select"
  on public.order_lines for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_lines.order_id
        and orders.account_id = auth.uid()
    )
  );

create policy "order_lines_admin_all"
  on public.order_lines for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── visit_groups: via parent order ──────────────────────────────────────────
create policy "visit_groups_own_select"
  on public.visit_groups for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = visit_groups.order_id
        and orders.account_id = auth.uid()
    )
  );

create policy "visit_groups_admin_all"
  on public.visit_groups for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── results: own profiles only ──────────────────────────────────────────────
create policy "results_own_select"
  on public.results for select
  using (
    profile_id in (
      select id from public.patient_profiles where account_id = auth.uid()
    )
  );

-- Patients may update only viewed_at on their own results.
create policy "results_own_update_viewed_at"
  on public.results for update
  using (
    profile_id in (
      select id from public.patient_profiles where account_id = auth.uid()
    )
  )
  with check (
    profile_id in (
      select id from public.patient_profiles where account_id = auth.uid()
    )
  );

create policy "results_admin_all"
  on public.results for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── notifications: own read ─────────────────────────────────────────────────
create policy "notifications_own_select"
  on public.notifications for select
  using (
    profile_id in (
      select id from public.patient_profiles where account_id = auth.uid()
    )
  );

create policy "notifications_admin_all"
  on public.notifications for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_tests_lab_id         on public.tests(lab_id);
create index if not exists idx_tests_category       on public.tests(category);
create index if not exists idx_tests_active         on public.tests(active);
create index if not exists idx_tests_slug           on public.tests(slug);

create index if not exists idx_orders_account_id    on public.orders(account_id);
create index if not exists idx_orders_status        on public.orders(status);
create index if not exists idx_orders_payment_id    on public.orders(stripe_payment_intent_id);

create index if not exists idx_order_lines_order_id    on public.order_lines(order_id);
create index if not exists idx_order_lines_profile_id  on public.order_lines(profile_id);
create index if not exists idx_order_lines_test_id     on public.order_lines(test_id);

create index if not exists idx_results_profile_id      on public.results(profile_id);
create index if not exists idx_results_order_line_id   on public.results(order_line_id);
create index if not exists idx_results_uploaded_at     on public.results(uploaded_at);

create index if not exists idx_patient_profiles_account_id on public.patient_profiles(account_id);

create index if not exists idx_consents_profile_id   on public.consents(profile_id);
create index if not exists idx_consents_account_id   on public.consents(account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. UPDATED_AT TRIGGER (reusable)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tests_updated_at            on public.tests;
create trigger tests_updated_at
  before update on public.tests
  for each row execute procedure public.handle_updated_at();

drop trigger if exists accounts_updated_at         on public.accounts;
create trigger accounts_updated_at
  before update on public.accounts
  for each row execute procedure public.handle_updated_at();

drop trigger if exists patient_profiles_updated_at on public.patient_profiles;
create trigger patient_profiles_updated_at
  before update on public.patient_profiles
  for each row execute procedure public.handle_updated_at();

drop trigger if exists orders_updated_at           on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute procedure public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. STORAGE: results-pdfs bucket (private)
-- Note: Storage bucket creation must be done via Supabase dashboard or CLI.
--   Dashboard: Storage > New bucket > Name: results-pdfs > uncheck "Public"
--   CLI:       supabase storage create results-pdfs --no-public
-- All result PDFs are served only via signed URLs with 1-hour expiry.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. SEED DATA: Labs
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.labs (id, name, country, shipping_schedule, shipping_notes, results_visibility, turnaround_min_days, turnaround_max_days, turnaround_notes, cross_border_country)
values
  (
    gen_random_uuid(),
    'Mayo Clinic Laboratories',
    'United States',
    'weekly_wednesday',
    'Specimens shipped every Wednesday. Ensure collection occurs no later than Tuesday.',
    'full',
    7, 14,
    'Turnaround calculated from lab receipt, not collection date.',
    'US'
  ),
  (
    gen_random_uuid(),
    'Armin Labs',
    'Germany',
    'same_day',
    'Specimens shipped same day as collection.',
    'full',
    14, 21,
    'Results delivered directly to patient with AvoVita copied on all results.',
    'DE'
  ),
  (
    gen_random_uuid(),
    'Dynacare',
    'Canada',
    'kit_only',
    'Kit-based collection, ships same day',
    'none',
    null, null,
    'Results go directly to referring care provider on requisition. AvoVita does not receive or relay results. All result follow up direct with Dynacare Genetics.',
    null
  ),
  (
    gen_random_uuid(),
    'ReligenDx',
    'United States',
    'same_day',
    'Specimens shipped same day as collection.',
    'none',
    7, 10,
    'Results go directly to referring care provider on requisition. AvoVita does not receive or relay results. All result follow up direct with ReligenDx.',
    'US'
  )
on conflict do nothing;

-- End of migration
