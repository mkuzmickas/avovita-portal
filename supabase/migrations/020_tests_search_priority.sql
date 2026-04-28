-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 020: tests.search_priority — pin specific tests to the top of
-- customer-facing search results.
-- ═══════════════════════════════════════════════════════════════════════════════
-- Higher values rank higher when the query matches. Most tests stay at the
-- default 0 (no pin); a future pin is a one-line UPDATE rather than a code
-- change. Browse / no-query order stays alphabetical (the catalogue client
-- only applies the priority sort when a search query is active).

alter table public.tests
  add column if not exists search_priority integer default 0;

-- Initial pin: Vitamin D2 & D3 (25-OH), SKU 25HDN.
update public.tests set search_priority = 100 where sku = '25HDN';
