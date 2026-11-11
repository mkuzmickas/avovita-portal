-- 049_order_lines_is_promo.sql
--
-- Adds an is_promo boolean flag to order_lines so the free Vitality
-- Check line (and any future free-test promos) can be distinguished
-- from a regular $0 line. Materialise writes is_promo=true alongside
-- unit_price_cad=0 for promo lines.
--
-- Nullable boolean, defaults to false, so every pre-existing line
-- stays correctly classified without a backfill UPDATE. Downstream
-- readers treat NULL same as FALSE.

ALTER TABLE order_lines
  ADD COLUMN is_promo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN order_lines.is_promo IS
  'True for lines written as part of a free promo (Vitality Check, etc). unit_price_cad on these rows is always 0; the test is still shipped/billed to the lab at the normal cost.';

CREATE INDEX IF NOT EXISTS order_lines_is_promo_idx
  ON order_lines (is_promo)
  WHERE is_promo = true;
