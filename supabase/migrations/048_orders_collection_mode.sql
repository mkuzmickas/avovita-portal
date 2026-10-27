-- 048_orders_collection_mode.sql
--
-- Adds a collection_mode column to orders so we can distinguish between
-- the existing in-home mobile phlebotomist flow and the new in-clinic
-- Tuesday flow Mike is piloting out of a shared clinic space Oct 2026.
--
-- Values:
--   mobile       — phlebotomist comes to the client (existing flow)
--   clinic       — client comes to the clinic (new Tuesday-only flow)
--   out_of_town  — drop-in at the Macleod Trail collection point
--
-- NULL remains valid and is treated as "mobile" by every reader. All
-- orders predating this migration therefore stay correctly classified
-- without a backfill UPDATE.
--
-- No change to appointment_at semantics — a clinic appointment still
-- lives on orders.appointment_at. The /admin/clinic page filters on
-- collection_mode = 'clinic' AND appointment_at::date = picked day.

ALTER TABLE orders
  ADD COLUMN collection_mode text
    CHECK (collection_mode IS NULL OR collection_mode IN ('mobile', 'clinic', 'out_of_town'));

COMMENT ON COLUMN orders.collection_mode IS
  'How the specimen is collected. mobile = home visit, clinic = in-clinic appointment, out_of_town = drop-in. NULL = legacy, treated as mobile.';

CREATE INDEX IF NOT EXISTS orders_collection_mode_appointment_at_idx
  ON orders (collection_mode, appointment_at)
  WHERE collection_mode IS NOT NULL;
