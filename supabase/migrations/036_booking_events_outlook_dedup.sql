-- Deduplication + polling metadata for the Microsoft Graph
-- FloLabs inbox poller (replaces the Power Automate webhook path).
--
-- outlook_message_id is the Graph message.id we've already processed.
-- Unique so a second poll pass can't create a duplicate row.
--
-- source column is repurposed to differentiate ingest paths:
--   'flolabs_inbound'  (deprecated Power Automate webhook)
--   'outlook_poll'     (Microsoft Graph poller)
--   'manual_paste'     (Jenna via /admin/bookings/new)

alter table public.booking_events
  add column if not exists outlook_message_id text;

create unique index if not exists idx_booking_events_outlook_message_id
  on public.booking_events (outlook_message_id)
  where outlook_message_id is not null;

comment on column public.booking_events.outlook_message_id is
  'Microsoft Graph message.id for FloLabs confirmations imported via the Outlook poller. Unique — a re-poll of the same message is a no-op.';
