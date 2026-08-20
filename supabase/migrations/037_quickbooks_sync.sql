-- ─────────────────────────────────────────────────────────────────────────────
-- 037 · QuickBooks Online sync
--
-- Three tables:
--   integrations       — OAuth token store, one row per provider (currently
--                        just 'quickbooks'). Refresh tokens are long-lived
--                        (~100 days for Intuit) so we persist them and
--                        auto-refresh access tokens as they expire.
--   qbo_transactions   — mirror of QBO Purchase / Bill / Expense /
--                        CreditCardCharge rows. One row per QBO transaction;
--                        `qbo_id`+`qbo_txn_type` is the unique dedup key so
--                        re-runs are idempotent.
--   expense_categories — supplier-name (or QBO account) → internal category
--                        map. Seeded from the categorization we agreed on;
--                        editable from the admin UI.
--
-- The existing `expenses` table (manual entries) is untouched — QBO data
-- lives alongside it. The financials view unions both.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── integrations (OAuth tokens) ─────────────────────────────────────────────
create table if not exists public.integrations (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  realm_id        text,                       -- QBO 'realmId' (their company id)
  access_token    text not null,
  refresh_token   text not null,
  token_type      text default 'bearer',
  expires_at      timestamptz not null,       -- when access_token expires (~1h for QBO)
  refresh_expires_at timestamptz,             -- when refresh_token expires (~100d for QBO)
  scope           text,
  connected_by    text,                       -- admin email who authorized
  connected_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider)
);

comment on table public.integrations is
  'OAuth token store. One row per provider. Refresh token is long-lived; access token gets rotated.';

-- ─── qbo_transactions ────────────────────────────────────────────────────────
create table if not exists public.qbo_transactions (
  id                uuid primary key default gen_random_uuid(),
  qbo_id            text not null,            -- QBO's own transaction id
  qbo_txn_type      text not null,            -- 'Purchase' | 'Bill' | 'Expense' | 'CreditCardCharge' | 'VendorCredit'
  txn_date          date not null,
  supplier_name     text,                     -- QBO vendor DisplayName (or 'Name' for cash txns)
  supplier_qbo_id   text,                     -- QBO vendor id (for stable joins)
  account_name      text,                     -- payment account (Amex / Scotia / etc.)
  memo              text,
  amount_cad        numeric(12,2) not null,   -- absolute value; sign in `direction`
  direction         text not null check (direction in ('expense', 'refund')),
  category          text,                     -- resolved from expense_categories at sync time
  posting           boolean not null default true,
  raw               jsonb not null,           -- verbatim QBO payload for debug / reprocessing
  synced_at         timestamptz not null default now(),
  unique (qbo_id, qbo_txn_type)
);

create index if not exists idx_qbo_transactions_date on public.qbo_transactions (txn_date desc);
create index if not exists idx_qbo_transactions_supplier on public.qbo_transactions (supplier_name);
create index if not exists idx_qbo_transactions_category on public.qbo_transactions (category);

comment on table public.qbo_transactions is
  'Mirror of QBO expense-side transactions. Idempotent on (qbo_id, qbo_txn_type). Excludes CreditCardPayment (money-movement, not P&L).';

-- ─── expense_categories (supplier → category map) ────────────────────────────
create table if not exists public.expense_categories (
  id                uuid primary key default gen_random_uuid(),
  supplier_pattern  text not null,            -- case-insensitive; matches supplier_name via ILIKE
  category          text not null,            -- 'cogs_lab' | 'cogs_shipping' | 'cogs_supplies' | 'contractor' | 'saas' | 'marketing' | 'regulatory' | 'bank_fees' | 'travel' | 'inventory' | 'other'
  notes             text,
  is_cogs           boolean not null default false,  -- convenience flag for margin math
  created_at        timestamptz not null default now(),
  unique (supplier_pattern)
);

comment on table public.expense_categories is
  'Maps QBO supplier names to internal categories. Pattern-matched with ILIKE so partial matches work (e.g. "%FEDEX%" catches all variants).';

-- Seed the categorization we agreed on. First-match-wins order isn't
-- guaranteed by ILIKE, so patterns should be distinct enough not to
-- overlap. `is_cogs` marks lines that hit gross margin directly.
insert into public.expense_categories (supplier_pattern, category, is_cogs, notes) values
  -- COGS: outside labs
  ('Mayo Clinic',      'cogs_lab',      true,  'Mayo XiFin invoices — attributed per-order later'),
  ('Armin Labs',       'cogs_lab',      true,  'Armin Labs (Germany) — per-order costs'),
  ('Dynacare',         'cogs_lab',      true,  'Gamma-Dynacare Canadian orders'),
  ('ReligenDx',        'cogs_lab',      true,  'ReligenDx US orders'),
  -- COGS: shipping + supplies
  ('FedEx',            'cogs_shipping', true,  'FedEx shipments — attribute per-order via label id when possible'),
  ('Calgary Dry Ice',  'cogs_supplies', true,  'Dry ice for cold-chain specimens'),
  ('Uline',            'cogs_supplies', true,  'Shipping supplies (boxes, tape, etc.)'),
  ('Stevens Medical',  'cogs_supplies', true,  'Medical consumables (needles, tubes)'),
  -- Contractor (below-the-gross-margin but before OpEx)
  ('FloLabs',          'contractor',    false, 'FloLabs mobile phlebotomy contractor'),
  -- SaaS / infra
  ('Anthropic',        'saas',          false, 'Claude subscription + API'),
  ('Vercel',           'saas',          false, 'Portal hosting'),
  ('Supabase',         'saas',          false, 'Portal database'),
  ('Open AI',          'saas',          false, 'ChatGPT subscription'),
  ('OpenAI',           'saas',          false, 'OpenAI API'),
  ('Twilio',           'saas',          false, 'SMS notifications'),
  ('Samurai Technologies', 'saas',      false, 'AvoVita marketing website CMS'),
  ('Go Daddy',         'saas',          false, 'Domain registration'),
  ('GoDaddy',          'saas',          false, 'Domain registration'),
  ('Jane App',         'saas',          false, 'Practice management (unused post-portal?)'),
  ('Hush Mail',        'saas',          false, 'Encrypted email'),
  ('Grasshopper',      'saas',          false, 'Business phone'),
  ('VOIP',             'saas',          false, 'VoIP.ms phone'),
  ('Google',           'saas',          false, 'Google Workspace / Play'),
  ('QuickBooks Payments', 'saas',       false, 'QBO subscription'),
  ('Apple',            'saas',          false, 'iCloud / App Store'),
  -- Marketing
  ('EB Marketing',     'marketing',     false, 'External marketing agency'),
  ('Mothermind',       'marketing',     false, 'Mothermind partnership (also client)'),
  ('HRD2KLL',          'marketing',     false, 'HRD2KLL supplement / marketing'),
  -- Regulatory / professional
  ('Apega',            'regulatory',    false, 'APEGA professional dues'),
  -- Bank / finance
  ('Scotiabank',       'bank_fees',     false, 'Chequing service charges + gov tax'),
  -- Travel
  ('Uber',             'travel',        false, 'Uber trips'),
  -- Inventory / supplements (for resale — may reclassify)
  ('MitoLife',         'inventory',     false, 'MitoLife supplements'),
  ('Biobody',          'inventory',     false, 'BodyBio supplements'),
  ('Nivara',           'inventory',     false, 'Nivara supplements'),
  ('Ledger',           'inventory',     false, 'Ledger crypto wallet — reclassify?'),
  -- Ambiguous / to categorize
  ('SD RECON',         'other',         false, 'Unknown — needs categorization'),
  ('TimPro',           'other',         false, 'Unknown — needs categorization'),
  ('Expo',             'other',         false, '650 Industries (Expo) — software?'),
  ('Telus',            'saas',          false, 'Business phone / internet')
on conflict (supplier_pattern) do nothing;
