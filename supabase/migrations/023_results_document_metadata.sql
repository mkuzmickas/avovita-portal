-- =============================================================================
-- 023_results_document_metadata.sql
--
-- Manual-upload Results Repository — document metadata columns.
--
-- The admin Results Repository feature (PatientResultsRepository) already
-- supports drag-and-drop multi-file uploads of arbitrary PDFs against a
-- patient profile. This migration extends each row with the per-document
-- metadata that admins capture at upload time: document type, the date
-- the document was issued (independent of the upload date), and a
-- short freeform description.
--
-- Scope:
--   • Manual uploads only — existing order-attached rows keep NULL on
--     the new columns. The customer-facing view falls back to
--     uploaded_at when document_date is NULL, so historical rows render
--     identically.
--   • The document_type values come from the spec; we use a CHECK
--     constraint rather than a Postgres enum so the list can be edited
--     in a future migration without dropping/recreating the type.
-- =============================================================================

alter table public.results
  add column if not exists document_type text
    check (document_type in (
      'lab_result',
      'imaging_report',
      'specialist_report',
      'medical_history',
      'prescription',
      'other'
    )),
  add column if not exists document_date date,
  add column if not exists description text;

-- Sort the customer view efficiently when the new column is populated.
create index if not exists idx_results_document_date
  on public.results (document_date desc nulls last);

-- No backfill: existing order rows intentionally retain NULL for these
-- columns. The admin patient list and customer results page both treat
-- document_type as optional and fall back to "Lab Result" or to
-- uploaded_at as appropriate.
