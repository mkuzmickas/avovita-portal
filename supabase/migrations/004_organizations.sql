-- =============================================================================
-- 004_organizations.sql
--
-- Multi-organization (white-label partner) support. Partners like
-- "Always Best Care" get their own branded landing at
-- portal.avovita.ca/org/<slug> while sharing all backend infra.
--
-- Schema additions:
--   - organizations (name, slug, logo_url, brand colours, contact, active)
--   - accounts.org_id    (FK) — tags users created via an org URL
--   - orders.org_id      (FK) — tags orders placed via an org URL
--   - RLS: anon reads active orgs; admins manage everything
--
-- Storage bucket `org-logos` must exist as PUBLIC (created in dashboard).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  logo_url        text,
  primary_color   text DEFAULT '#2d6b35',
  accent_color    text DEFAULT '#c4973a',
  contact_email   text,
  active          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_accounts_org_id ON public.accounts (org_id);
CREATE INDEX IF NOT EXISTS idx_orders_org_id   ON public.orders   (org_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_public_read_active"
  ON public.organizations FOR SELECT
  USING (active = true);

CREATE POLICY "orgs_admin_all"
  ON public.organizations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Seed
INSERT INTO public.organizations (name, slug, logo_url, primary_color, accent_color, contact_email)
VALUES (
  'Always Best Care',
  'AlwaysBestCare',
  NULL,
  '#1a3d6b',
  '#c4973a',
  'info@alwaysbestcare.com'
)
ON CONFLICT (slug) DO NOTHING;
