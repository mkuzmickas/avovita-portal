-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 022: quotes.custom_lines  +  order_lines.custom_line_*  columns
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds support for admin-entered custom line items on quotes — freeform charges
-- (or credits) beyond the standard test/supplement/fee lines. Use case:
-- "FloLabs travel — 240km @ $1.25/km" → $300 for a Banff client.
--
-- DATA SHAPE (JSONB array on quotes):
--   [{ "description": string, "amount_cad": number, "notes": string | null }]
--
--   - description: customer-facing label, 1-100 chars (validated client + server)
--   - amount_cad: positive (charge) or negative (credit), max 4dp
--   - notes:       admin-only, never rendered customer-side; null when empty
--
-- JSONB instead of a separate `quote_custom_lines` table because:
--   - usage volume is tiny (a handful of custom lines per occasional quote)
--   - no individual-line FK relationships are needed
--   - one query for /api/quotes/[number] instead of two
--   - mirrors how `pending_orders.cart_snapshot` already stores variable line
--     shapes — same architectural pattern
--
-- The corresponding order_lines columns let the webhook materialise custom
-- lines into the order_lines table (one row per custom line) so they appear
-- in admin order detail and the order confirmation email. line_type='custom'
-- is the discriminator.

alter table public.quotes
  add column if not exists custom_lines jsonb not null default '[]'::jsonb;

comment on column public.quotes.custom_lines is
  'Admin-entered freeform charge / credit lines beyond the standard test + fee lines. JSONB array of { description, amount_cad, notes }. Stripe creates one line item per entry at checkout; the webhook materialises them into order_lines with line_type=''custom''.';

-- order_lines now needs to support custom-line rows. The line_type column
-- already exists (added in supplements/resources migrations); we extend it
-- with the new value and add columns custom_lines need that test/supplement
-- /resource lines don't.

alter table public.order_lines
  add column if not exists custom_description text,
  add column if not exists custom_notes text;

comment on column public.order_lines.custom_description is
  'Customer-facing label for line_type=custom rows. Mirrored from the quote''s custom_lines[].description at checkout time.';
comment on column public.order_lines.custom_notes is
  'Admin-only internal notes for line_type=custom rows. Never rendered customer-side. NULL for non-custom lines.';
