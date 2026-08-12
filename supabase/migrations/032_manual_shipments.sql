-- Migration 032: manual_shipments table for FedEx-created labels
--
-- Every time FloLabs (or Mike) clicks a "Ship X" button on
-- /shipping, we create a FedEx label via the Ship API and record
-- the resulting shipment here. The button endpoint sends Mike an
-- email notification with the tracking number and label URL so he
-- has a real-time audit trail even without touching the DB.
--
-- Not linked to public.orders because a single FedEx pickup often
-- contains specimens from multiple orders — the tracking number is
-- against the shipment, not per-patient. Admin can cross-reference
-- manually if a specific specimen goes missing.

create table if not exists public.manual_shipments (
  id                   uuid primary key default gen_random_uuid(),
  -- Which preset button was clicked: 'mayo_frozen' | 'armin_labs' | future.
  profile_kind         text not null,
  -- FedEx tracking number returned from Ship API. Master tracking number
  -- for multi-piece shipments; we only ship single-piece today.
  tracking_number      text not null,
  -- FedEx service level used (e.g. "INTERNATIONAL_PRIORITY_EXPRESS").
  service_type         text,
  -- Signed URL / storage path for the label PDF returned by FedEx.
  -- FedEx label URLs expire — persist a copy in Supabase Storage
  -- and store the storage path here for permanent access.
  label_url            text,
  -- Same for the commercial invoice + any additional ETD documents
  -- returned in the Ship API response.
  documents_urls       jsonb,
  -- Total declared value + weight for at-a-glance reference.
  weight_lb            numeric(6,2),
  declared_value_cad   numeric(10,2),
  -- Optional free-text note the shipper can type before clicking
  -- Ship — e.g. "Includes Wilson + Jarvis specimens".
  notes                text,
  -- 'sandbox' | 'production' — snapshot of FEDEX_API_URL at time of
  -- creation. Prevents sandbox test records from being confused with
  -- real shipments if someone later checks tracking numbers.
  environment          text not null default 'sandbox',
  -- Optional per-shipper attribution — if the /shipping page later
  -- adds a "Your name" input, FloLabs staff can type "Sarah" etc.
  -- so the manual_shipments record shows who initiated the ship.
  shipped_by_name      text,
  created_at           timestamptz not null default now()
);

-- Admin sort-by-recent is the dominant access pattern.
create index if not exists idx_manual_shipments_created_at
  on public.manual_shipments (created_at desc);

-- RLS: admin only. This table has no per-user access — it's an
-- operational audit log gated behind the shipping-page token.
alter table public.manual_shipments enable row level security;
create policy "manual_shipments admin read"
  on public.manual_shipments for select
  using (
    exists (
      select 1 from public.accounts
      where accounts.id = auth.uid()
        and accounts.role = 'admin'
    )
  );
create policy "manual_shipments admin write"
  on public.manual_shipments for insert
  with check (true);
-- Insert policy is permissive because the /api/shipping/create-label
-- route uses the service-role client (bypasses RLS entirely) — the
-- policy exists only so the check isn't blank. Public read is
-- restricted to admins.

comment on table public.manual_shipments is
  'FedEx labels created via /shipping. Populated by /api/shipping/create-label after a successful Ship API call. One row per label. See src/lib/config/shipping-profiles.ts for the preset kinds.';
