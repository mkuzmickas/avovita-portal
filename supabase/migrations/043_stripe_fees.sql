-- ─────────────────────────────────────────────────────────────────────────────
-- 043 · Capture Stripe processing fees on orders
--
-- Stripe deposits NET of fees to the bank, so QBO sees the reduced
-- amount but never sees the fee itself. Result: Financials shows
-- inflated revenue AND misses ~2.9%+30¢ of real OpEx per order.
--
-- Store the fee alongside the order. Populated by:
--   - Webhook handler on payment_intent.succeeded (going forward)
--   - Backfill route walking existing orders (one-time + safety net)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists stripe_fee_cad numeric(10,2);

comment on column public.orders.stripe_fee_cad is
  'Stripe processing fee (CAD) for this order, from the balance_transaction on the payment_intent. NULL when unknown / not yet backfilled. Feeds an implicit "payment processing" OpEx line in the Financials view.';

create index if not exists orders_stripe_fee_pending_idx
  on public.orders (id)
  where stripe_fee_cad is null and stripe_payment_intent_id is not null;
