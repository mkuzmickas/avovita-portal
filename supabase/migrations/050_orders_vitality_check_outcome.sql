-- 050_orders_vitality_check_outcome.sql
--
-- Persists whether the Vitality Check picker was offered and what the
-- customer did with it, so Mike can answer "did Carrie-anne actually
-- decline the freebie, or did the modal never fire?" for any order.
--
-- Values:
--   not_offered  — picker didn't fire (cart didn't qualify, promo gate
--                  was off, mixed cart routed through unified, etc.)
--   dismissed    — modal fired and the customer skipped it
--   claimed      — modal fired and the customer picked a free test
--
-- Nullable so pre-migration orders (before the promo feature shipped)
-- stay NULL. Any new order written by materialise after this migration
-- lands with one of the three values set by CheckoutClient based on
-- the modal state.

ALTER TABLE orders
  ADD COLUMN vitality_check_outcome text
    CHECK (
      vitality_check_outcome IS NULL
      OR vitality_check_outcome IN ('not_offered', 'dismissed', 'claimed')
    );

COMMENT ON COLUMN orders.vitality_check_outcome IS
  'Vitality Check promo outcome for this order. NULL = pre-feature, not_offered = modal did not fire, dismissed = customer skipped it, claimed = customer picked a free test.';

CREATE INDEX IF NOT EXISTS orders_vitality_check_outcome_idx
  ON orders (vitality_check_outcome)
  WHERE vitality_check_outcome IS NOT NULL;
