CREATE TABLE public.promo_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  description text,
  percent_off integer DEFAULT 0,
  amount_off decimal(10,2) DEFAULT 0,
  currency text DEFAULT 'cad',
  active boolean DEFAULT true,
  stripe_promo_id text,
  stripe_coupon_id text,
  org_id uuid REFERENCES public.organizations(id),
  max_redemptions integer,
  times_redeemed integer DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX promo_codes_code_lower_idx
  ON public.promo_codes (LOWER(code));

-- Seed existing codes
INSERT INTO public.promo_codes (code, description, percent_off, active, stripe_promo_id, stripe_coupon_id)
VALUES
  ('avovita-test', 'AvoVita Internal Test Code', 100, true, 'promo_1TMJRSE9gWNhcyAk', 'XiMcnJLm'),
  ('abc-demo', 'Always Best Care Demo Code', 100, true, 'promo_1TMJQCE9gWNhcyAk44T5fWy1', 'eTRAfNnv');

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_codes_public_read_active"
  ON public.promo_codes FOR SELECT
  USING (active = true);

CREATE POLICY "promo_codes_admin_all"
  ON public.promo_codes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.accounts WHERE id = auth.uid() AND role = 'admin')
  );
