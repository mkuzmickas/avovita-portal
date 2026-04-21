-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 016: Persist GST on quotes
-- ═══════════════════════════════════════════════════════════════════════════════
-- `total_cad` stays pre-tax (matches the checkout code pattern:
-- subtotalBeforeTax + estimatedGST = grandTotal). `gst_cad` snapshots the
-- tax at save time so historical quotes never drift if the rate changes.
-- NULL means "not computed yet" — the UI derives it client-side until the
-- next save persists the canonical value.

alter table public.quotes
  add column if not exists gst_cad numeric(10,2);
