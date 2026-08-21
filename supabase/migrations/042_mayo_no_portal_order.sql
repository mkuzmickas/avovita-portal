-- ─────────────────────────────────────────────────────────────────────────────
-- 042 · Mayo invoice lines: 'no portal order' overhead flag
--
-- Not every Mayo charge maps to a portal order. Mike, Jenna, and
-- friends sometimes send specimens directly to Mayo without going
-- through the customer-facing checkout — those still hit AvoVita's
-- Amex bill but they have no corresponding portal revenue.
--
-- Adding a boolean flag rather than a status enum so it stacks
-- cleanly with the existing order_id: a line is either
--   - order_id IS NOT NULL (matched to a client order — billable),
--   - no_portal_order = TRUE (explicit overhead — internal use), or
--   - both NULL/FALSE (unmatched — needs review).
-- The two "resolved" states (matched OR overhead) are what the UI
-- progress bar counts as done.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.mayo_invoice_lines
  add column if not exists no_portal_order boolean not null default false;

comment on column public.mayo_invoice_lines.no_portal_order is
  'TRUE when this Mayo line does NOT correspond to a portal order — internal use (Mike/Jenna/friends direct to Mayo). Its cost is real overhead but has no client revenue.';

-- Sanity: never both matched AND flagged as no_portal_order.
alter table public.mayo_invoice_lines
  drop constraint if exists mayo_line_matched_or_overhead_ck;
alter table public.mayo_invoice_lines
  add  constraint mayo_line_matched_or_overhead_ck
       check (not (order_id is not null and no_portal_order = true));

create index if not exists mayo_lines_overhead_idx
  on public.mayo_invoice_lines (no_portal_order)
  where no_portal_order = true;
