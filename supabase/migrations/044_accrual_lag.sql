-- ─────────────────────────────────────────────────────────────────────────────
-- 044 · Accrual lag per expense category
--
-- Mayo bills 30-60 days after service. FloLabs invoices monthly for
-- the prior month. So Mayo's July invoice hits AMEX in early August,
-- and cash-basis P&L attributes it to August — a month with only
-- partial revenue at that point, making that month look horrible
-- while July looks artificially rosy.
--
-- Fix: store an accrual lag (in days) per category. At read time,
-- bucket a transaction by `txn_date - lag_days` instead of raw
-- txn_date. Same year totals, but individual months line up
-- properly with the revenue they enabled.
--
-- Seeded values based on observed AvoVita billing cadence — Mike
-- can tune these via SQL later:
--   cogs_lab       30 days  (Mayo / Armin / Dynacare / ReligenDx)
--   contractor     30 days  (FloLabs — bills monthly for prior month)
--   cogs_shipping   0 days  (FedEx label = same-day cost)
--   cogs_supplies   0 days  (dry ice, Uline, Stevens — consumed on
--                            purchase; keep 0)
--   saas            0 days  (subscription for the month it hits)
--   marketing       0 days  (typically same-month spend)
--   bank_fees       0 days  (same-day)
--   travel          0 days  (same-day)
--   inventory       0 days
--   regulatory      0 days
--   other           0 days
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.expense_categories
  add column if not exists accrual_lag_days integer not null default 0;

comment on column public.expense_categories.accrual_lag_days is
  'Days to subtract from txn_date to derive the service month for P&L bucketing. 30 for Mayo/FloLabs which invoice ~monthly-in-arrears. Adjust per supplier if needed — the applied lag is the one from the row whose supplier_pattern matched.';

update public.expense_categories set accrual_lag_days = 30
  where category in ('cogs_lab', 'contractor');
