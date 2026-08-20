-- ─────────────────────────────────────────────────────────────────────────────
-- 039 · Mayo Clinic invoice ingestion (Pipeline 2)
--
-- Two tables that together let us load a Mayo Clinic Laboratories
-- monthly invoice, match each patient-level line item to a portal
-- order, and feed real per-order Mayo COGS into the P&L.
--
--   mayo_invoices        one row per PDF invoice (unique by invoice_number)
--   mayo_invoice_lines   one row per test line (accession × test_id).
--                        `order_id` starts NULL; the matcher UI drag-
--                        drops it onto a portal order and stamps
--                        matched_at / matched_by.
--
-- Panel component CPTs (e.g. 84439/84436 under T4FT4) have no charge
-- on the invoice — those rows are NOT ingested; only the charged
-- parent test is captured.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create table if not exists public.mayo_invoices (
  id               uuid primary key default gen_random_uuid(),
  invoice_number   text not null,
  invoice_date     date not null,
  total_cad        numeric(12,2) not null,
  source_filename  text,
  uploaded_by      text,
  uploaded_at      timestamptz not null default now(),
  unique (invoice_number)
);

create table if not exists public.mayo_invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.mayo_invoices(id) on delete cascade,
  collection_date  date not null,
  accession_no     text not null,
  specimen_no      text,
  mayo_patient_id  text,
  patient_name     text not null,
  test_id          text not null,
  cpt              text,
  description      text,
  charge_cad       numeric(12,2) not null,
  order_id         uuid references public.orders(id) on delete set null,
  matched_at       timestamptz,
  matched_by       text,
  unique (invoice_id, accession_no, test_id)
);

create index if not exists idx_mayo_lines_invoice   on public.mayo_invoice_lines(invoice_id);
create index if not exists idx_mayo_lines_order     on public.mayo_invoice_lines(order_id);
create index if not exists idx_mayo_lines_patient   on public.mayo_invoice_lines(patient_name);
create index if not exists idx_mayo_lines_mayo_pid  on public.mayo_invoice_lines(mayo_patient_id);
create index if not exists idx_mayo_lines_date      on public.mayo_invoice_lines(collection_date);

comment on table public.mayo_invoices is
  'Mayo Clinic Laboratories monthly invoices. One row per PDF; unique by invoice_number.';
comment on table public.mayo_invoice_lines is
  'One row per charged line (accession × test_id). order_id is set when the matcher UI links the line to a portal order.';
