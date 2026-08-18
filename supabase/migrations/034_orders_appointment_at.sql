-- Adds full-timestamp appointment fields so the admin calendar can
-- place orders in specific hour slots. Previously we only had
-- orders.appointment_date (DATE, nullable), which loses the time and
-- makes hour-grid rendering impossible.
--
-- Backfill: any existing appointment_date is preserved by copying it
-- to appointment_at at 08:00 Calgary local (a neutral placeholder —
-- Jenna will re-assign correctly through the calendar UI as she
-- processes FloLabs email confirmations).

alter table public.orders
  add column if not exists appointment_at timestamptz,
  add column if not exists appointment_end_at timestamptz;

update public.orders
   set appointment_at = (appointment_date::text || 'T08:00:00-06:00')::timestamptz
 where appointment_date is not null
   and appointment_at is null;

comment on column public.orders.appointment_at is
  'Scheduled FloLabs collection start time (Calgary local, stored as TZ). Populated from the Acuity/FloLabs confirmation email — matched to the order via /admin/bookings/new or the future /api/bookings/flolabs-inbound webhook.';
comment on column public.orders.appointment_end_at is
  'Scheduled collection end time. Optional — defaults to +30 min at render if null.';

create index if not exists idx_orders_appointment_at
  on public.orders (appointment_at)
  where appointment_at is not null;
