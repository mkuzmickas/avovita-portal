-- =============================================================================
-- 027_orders_additional_discount.sql
--
-- New column: orders.additional_discount_cad — the sum of any admin-
-- entered quote discount + whole-cart promo code discount applied at
-- Stripe checkout time. Historically these were baked into per-line
-- unit_amount reductions, which silently zeroed the first line item
-- when the discount exceeded a single line's price, and left the
-- invoice PDF unable to display them separately from the multi-test
-- discount.
--
-- Going forward the checkout route sums these two adjustments and
-- applies them as a single Stripe `amount_off` coupon; the webhook
-- copies the value into this column so the invoice PDF can render
-- "Additional discount −$X" underneath the existing multi-test
-- "Discount −$Y" row.
--
-- Existing rows default to 0 — legacy pre-fix orders had these
-- discounts folded into subtotal / line prices so their invoice PDFs
-- kept working (just without the visible breakdown). Nothing else in
-- the app reads this column yet, so no back-compat concerns.
-- =============================================================================

alter table public.orders
  add column if not exists additional_discount_cad numeric(10,2) not null default 0;
