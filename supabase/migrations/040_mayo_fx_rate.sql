-- ─────────────────────────────────────────────────────────────────────────────
-- 040 · Mayo invoices are USD; add explicit FX rate
--
-- Mayo Clinic Laboratories bills from Rochester, MN in USD. The
-- previous schema stored the raw USD numbers in columns literally
-- named `charge_cad` / `total_cad`, which silently under-reported
-- Mayo COGS by the CAD/USD spread (~30-45% at AvoVita's Amex rate).
--
-- Rename to the honest column names and add `fx_rate` on the invoice
-- header. Default 1.43 (Mike's empirically-observed effective rate,
-- e.g. $4,000 USD Mayo charge landed at $5,687.52 CAD → 1.4219,
-- rounded to 1.43 for the math the team already uses). Editable
-- per-invoice from the matcher UI when a payment lands at a
-- different rate.
--
-- Downstream CAD amounts are computed at display / P&L time as
-- `charge_usd * mayo_invoices.fx_rate`; kept out of the DB as a
-- generated column because generated columns can't reference other
-- tables.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.mayo_invoices rename column total_cad to total_usd;
alter table public.mayo_invoices
  add column if not exists fx_rate numeric(6,4) not null default 1.43;

alter table public.mayo_invoice_lines rename column charge_cad to charge_usd;

comment on column public.mayo_invoices.total_usd is
  'Grand total as billed by Mayo (USD).';
comment on column public.mayo_invoices.fx_rate is
  'USD → CAD conversion rate for THIS invoice (default 1.43). CAD amounts are computed as charge_usd * fx_rate at display time.';
comment on column public.mayo_invoice_lines.charge_usd is
  'Line-level charge as billed by Mayo (USD). Multiply by the parent invoice fx_rate to display CAD.';
