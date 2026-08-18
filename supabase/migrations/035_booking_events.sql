-- Audit trail + review queue for FloLabs booking confirmations
-- arriving via the /api/bookings/flolabs-inbound webhook.
--
-- Every incoming email creates a row here. Rows where FedEx auto-matched
-- an order are stamped resolution='auto_assigned'; ambiguous rows are
-- 'needs_review' and appear on /admin/bookings/queue for Jenna to
-- confirm the correct order manually. Rows with no candidates at all
-- are 'no_match' (client isn't in the portal yet).
--
-- The raw email body is stored so a bad match can be re-run through a
-- fixed parser without re-fetching from Outlook.

create table if not exists public.booking_events (
  id                      uuid primary key default gen_random_uuid(),
  received_at             timestamptz not null default now(),
  source                  text not null default 'flolabs_inbound',
  raw_email               text not null,
  parsed_client_name      text,
  parsed_client_email     text,
  parsed_client_phone     text,
  parsed_appointment_at   timestamptz,
  parsed_address          text,
  parse_warnings          text[] default array[]::text[],
  resolution              text not null default 'needs_review',
    -- 'auto_assigned' | 'needs_review' | 'no_match' | 'manually_assigned' | 'ignored'
  matched_order_id        uuid references public.orders(id) on delete set null,
  match_score             int,
  match_matched_by        text[] default array[]::text[],
  candidate_snapshot      jsonb,
  resolved_by             uuid references public.accounts(id) on delete set null,
  resolved_at             timestamptz
);

create index if not exists idx_booking_events_resolution_recent
  on public.booking_events (resolution, received_at desc)
  where resolution in ('needs_review', 'no_match');

comment on table public.booking_events is
  'Audit trail for FloLabs Acuity booking confirmations forwarded from Outlook via Power Automate. Each row is one inbound email; resolution tracks whether it auto-assigned or ended up in the review queue.';
comment on column public.booking_events.raw_email is
  'Full email body as forwarded. Retained so parsing bugs can be re-run against improved regex without touching the source mailbox.';
comment on column public.booking_events.candidate_snapshot is
  'JSONB array of the top candidate orders (with match scores) at the moment of ingest. Frozen at receive-time so the review queue shows what the auto-matcher saw.';

alter table public.booking_events enable row level security;
create policy "admin_reads_booking_events" on public.booking_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.accounts
      where accounts.id = auth.uid() and accounts.role = 'admin'
    )
  );
-- Writes only via service role (webhook + assign routes).
