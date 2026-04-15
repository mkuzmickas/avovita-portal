ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS manual_discount_value numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_type text DEFAULT 'amount'
    CHECK (manual_discount_type IN ('amount', 'percent'));
