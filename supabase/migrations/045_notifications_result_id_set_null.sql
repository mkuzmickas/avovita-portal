-- ─────────────────────────────────────────────────────────────────────────────
-- 045 · Loosen notifications.result_id FK from RESTRICT to SET NULL
--
-- Original schema (migration 001) declared:
--   result_id uuid references public.results(id) on delete restrict
-- which blocks any attempt to delete a `results` row that has a
-- notification pointing at it. In practice we DO want to delete
-- result rows (e.g. wrong PDF uploaded, duplicate, patient asked for
-- removal) — but keeping the notification history is valuable ("we
-- did send this patient a notice on this date"), so the right move
-- is SET NULL, not CASCADE.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notifications
  drop constraint if exists notifications_result_id_fkey;

alter table public.notifications
  add  constraint notifications_result_id_fkey
       foreign key (result_id)
       references public.results(id)
       on delete set null;

comment on column public.notifications.result_id is
  'The result this notification was about. Nullable — set to NULL when the underlying result row is deleted so the notification history survives as an audit record.';
