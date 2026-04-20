-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 014: Add collection_method to tests table
-- ═══════════════════════════════════════════════════════════════════════════════
-- Distinguishes phlebotomist-draw tests from self-collected kit tests
-- (stool, saliva). Used to calculate the kit service fee at checkout.

alter table public.tests
  add column if not exists collection_method text not null default 'phlebotomist_draw';

alter table public.tests
  add constraint tests_collection_method_check
  check (collection_method in ('phlebotomist_draw', 'self_collected_kit'));
