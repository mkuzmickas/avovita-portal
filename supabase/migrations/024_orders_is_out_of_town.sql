-- =============================================================================
-- 024_orders_is_out_of_town.sql
--
-- New "out of town" collection mode on the checkout wizard. Customers
-- visiting Calgary choose a drop-in collection at a dedicated location
-- (Tue/Sat mornings) instead of supplying their own address; that
-- selection is captured here so the post-payment success page can
-- render the dedicated out-of-town Acuity calendar and surface the
-- drop-in address (both supplied via env vars at render time — see
-- NEXT_PUBLIC_ACUITY_EMBED_URL_OUT_OF_TOWN and
-- NEXT_PUBLIC_OUT_OF_TOWN_DROPIN_ADDRESS).
--
-- Default false so every historical row remains an in-area order with
-- no behaviour change. Cheap, non-indexed boolean — orders are looked
-- up by id / stripe_session_id, never scanned by this flag.
-- =============================================================================

alter table public.orders
  add column if not exists is_out_of_town boolean not null default false;
