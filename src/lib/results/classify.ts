/**
 * Single source of truth for "what kind of result row is this?"
 *
 * Background: migration 003 declared the source column as
 *   source in ('order', 'manual_upload', 'patient_upload')
 * but production data has 21 rows with source='order_attached' and 1 with
 * 'manual_upload' — i.e. the original 'order' literal is dead. Code that
 * branches on `source === 'order'` silently misses every order row.
 *
 * The structural truth is `order_id`: a non-null FK means the row was
 * created by the order-results pipeline, regardless of whatever string
 * the source column happens to hold. We classify on that, and treat
 * `source` as advisory metadata for distinguishing manual vs patient
 * uploads (both have order_id = NULL).
 */

export type ResultClassification = "order" | "manual" | "patient";

export interface ClassifiableResult {
  source: string | null;
  order_id: string | null;
}

export function classifyResultRow(row: ClassifiableResult): ResultClassification {
  if (row.order_id) return "order";
  if (row.source === "patient_upload") return "patient";
  return "manual";
}

export function isOrderResult(row: ClassifiableResult): boolean {
  return classifyResultRow(row) === "order";
}

export function isManualResult(row: ClassifiableResult): boolean {
  return classifyResultRow(row) === "manual";
}
