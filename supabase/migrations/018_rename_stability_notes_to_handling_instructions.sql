-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 018: Rename stability_notes → handling_instructions
-- ═══════════════════════════════════════════════════════════════════════════════
-- Pure rename. Semantics shift from "stability info" (now redundant with the
-- structured handling_type + stability_days / stability_days_frozen columns
-- introduced in migration 017) to "collection and processing instructions for
-- FloLabs" (e.g., protect from light, centrifuge within 30 min, avoid
-- hemolysis). No data loss, no logic changes.

alter table public.tests rename column stability_notes to handling_instructions;
