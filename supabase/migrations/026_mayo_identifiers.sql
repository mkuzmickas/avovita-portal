-- =============================================================================
-- 026_mayo_identifiers.sql
--
-- Pipeline 1 of the Mayo results triage workflow: capture Mayo's
-- order/patient identifiers on portal orders so Pipeline 2 (results
-- PDFs) can deterministically match incoming result PDFs to the
-- portal order they belong to.
--
--   • orders.mayo_order_number     — Mayo's WEB-style order id
--                                    (e.g. "WEBQ65R9YL2M"), pulled
--                                    from the Pending Batch CSV
--                                    "Order Number" column.
--   • orders.mayo_patient_id       — Mayo's MRN (e.g. "1CJ5UL2J8"),
--                                    pulled from the CSV "Medical
--                                    Record Number" column. Kept on
--                                    orders for fast PDF→order lookup
--                                    in Pipeline 2.
--   • orders.mayo_ml_order_number  — Mayo's internal ML-style id
--                                    (e.g. "ML13661069"). Not in the
--                                    Pending Batch CSV; populated by
--                                    Pipeline 2 when the result PDF
--                                    header is parsed.
--   • patient_profiles.mayo_patient_id — same MRN, stamped on the
--                                    profile because the MRN is
--                                    consistent across all of that
--                                    patient's Mayo orders. Lets
--                                    future imports skip the
--                                    name+DOB match for known
--                                    patients.
--
-- All columns are nullable text with no default. No backfill — every
-- existing row stays null and gets populated going forward through
-- the admin pending-batch importer.
--
-- Indexes are partial btrees (WHERE NOT NULL) since the vast majority
-- of historical rows have no Mayo id and we only ever look up by id
-- when we have one in hand.
-- =============================================================================

-- ─── 1. Orders columns ───────────────────────────────────────────────────
alter table public.orders
  add column if not exists mayo_order_number     text,
  add column if not exists mayo_patient_id       text,
  add column if not exists mayo_ml_order_number  text;

-- ─── 2. Patient profiles column ──────────────────────────────────────────
alter table public.patient_profiles
  add column if not exists mayo_patient_id text;

-- ─── 3. Indexes ──────────────────────────────────────────────────────────
create index if not exists orders_mayo_order_number_idx
  on public.orders (mayo_order_number)
  where mayo_order_number is not null;

create index if not exists orders_mayo_patient_id_idx
  on public.orders (mayo_patient_id)
  where mayo_patient_id is not null;

create index if not exists orders_mayo_ml_order_number_idx
  on public.orders (mayo_ml_order_number)
  where mayo_ml_order_number is not null;

create index if not exists patient_profiles_mayo_patient_id_idx
  on public.patient_profiles (mayo_patient_id)
  where mayo_patient_id is not null;
