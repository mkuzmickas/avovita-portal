-- Adds tracking-status fields to manual_shipments so the shipping
-- console can show an inline status chip + delivered timestamp next
-- to each tracking number without hitting FedEx on every page load.
--
-- Status is refreshed opportunistically when /shipping is opened:
-- any row where delivered_at is null AND status_fetched_at is older
-- than a threshold (see refresh-tracking.ts) is re-fetched from
-- FedEx's Tracking API. Delivered rows are frozen — no more polling.

alter table public.manual_shipments
  add column if not exists tracking_status_code text,
  add column if not exists tracking_status_description text,
  add column if not exists delivered_at timestamptz,
  add column if not exists status_fetched_at timestamptz;

comment on column public.manual_shipments.tracking_status_code is
  'FedEx tracking status code (DL=delivered, IT=in transit, OD=out for delivery, PU=picked up, OC=order created, DE=delivery exception, etc.). Refreshed via /track/v1/trackingnumbers.';
comment on column public.manual_shipments.tracking_status_description is
  'Human-readable status from FedEx (e.g. "Delivered", "On FedEx vehicle for delivery").';
comment on column public.manual_shipments.delivered_at is
  'Actual delivery timestamp reported by FedEx. Set once — status polling stops after this.';
comment on column public.manual_shipments.status_fetched_at is
  'When the tracking status was last refreshed. Used to throttle re-fetches so we do not hit FedEx on every page load.';
