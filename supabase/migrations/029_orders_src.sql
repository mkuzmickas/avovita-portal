-- Migration 029: Add public.orders.src for entry-point attribution.
--
-- Every order records where the customer came from so we can measure
-- whether individual entry points (Ask AvoVita widget on the marketing
-- site, org partner pages, catalogue direct, etc.) actually produce
-- revenue. Right now the assistant is a black box: it answers questions
-- and nobody can tell whether any of them become orders.
--
-- Values are opaque short strings. Current known values:
--   'ask'    — Ask AvoVita widget on avovita.ca
--   NULL     — direct catalogue add, no attribution captured
--
-- We do NOT check-constrain the set because new entry points (org
-- partner tags, campaign SMS links, etc.) should be able to add their
-- own labels without a migration. The analytics dashboard groups by
-- src verbatim.

alter table public.orders
  add column if not exists src text;

comment on column public.orders.src is
  'Entry-point attribution slug captured at cart creation time from ?src=... URL parameter. Opaque short string (max 32 chars). NULL for orders where no src was supplied. Aggregated in the /admin/analytics dashboard to answer "does entry point X produce revenue?"';

create index if not exists idx_orders_src on public.orders(src)
  where src is not null;
