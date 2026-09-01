-- ─────────────────────────────────────────────────────────────────────────────
-- 047 · Per-test booking acknowledgement text
--
-- Some tests have hard scheduling constraints (short stability, weekly
-- courier cutoffs, lab-side receiving windows) that the customer must
-- acknowledge before booking their FloLabs collection. Rather than
-- hardcoding a list in code, expose a nullable text field on tests so
-- admins can flag a test with a specific acknowledgement message via
-- the admin Edit form.
--
-- Contract with the checkout UI (Step 3 Collection Details):
--   - If any test in the cart has a non-null booking_ack_text,
--     Step 3 renders a warning card containing every distinct message
--     plus a single required "I understand" checkbox before the date
--     picker's Continue button unlocks.
--   - Multiple tests with different messages stack their messages;
--     one checkbox covers acknowledgement of all of them.
--
-- Seeded for FNIRM (LabCorp NMR Lipoprotein Profile — 5-day stability
-- so it must ship early in the week to arrive within window). Other
-- tests can be flagged later via admin Edit; do not seed anything
-- else here.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tests
  add column if not exists booking_ack_text text;

comment on column public.tests.booking_ack_text is
  'Nullable — when set, checkout Step 3 shows this text as a required acknowledgement before the customer can select a collection date. Used for tests with hard scheduling constraints (short stability, weekly courier cutoffs).';

update public.tests
   set booking_ack_text =
     'This test must be collected on a Monday or Tuesday. Its 5-day stability window means specimens collected later in the week may arrive at the lab after they degrade and be rejected. Please select a Monday or Tuesday for your FloLabs appointment.'
 where sku = 'FNIRM'
   and booking_ack_text is null;
