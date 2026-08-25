import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Mayo Clinic Laboratories PRINTED BATCH SHEET parser.
 *
 * Different beast from the invoice parser — this is the shipment
 * manifest that goes IN the FedEx box. Structure per patient row
 * (Mayo layout as of 2026-08 — includes new Sex + DOB columns):
 *
 *   Order No.        WEBQ65RVUYCN
 *   Patient Name     Tomlin, Jennifer
 *   Patient ID       1CJ53FQS5
 *   Collected/Phys.  19 Aug 2026 09:00
 *   Sex              F
 *   DOB              02/15/1971
 *   Accession No.    ML13944118  (rendered as a barcode label at the
 *                                 top of the page)
 *   Tests            25HDN ... (indented below)
 *
 * Text extraction from Mayo's PDF collapses the Order/Name/ID/Collected
 * columns onto a single line per row (e.g.
 * `WEBQ65RVUYCN Tomlin, Jennifer 1CJ53FQS5 19 Aug 2026 09:00`), with
 * Sex + DOB dropping onto the following two lines. Long "Last, First"
 * names wrap: `WEBQ65RV1128 Bravo Jaraba, Meris` \n `Coromoto` \n
 * `1CJ4SDQRS 20 Aug 2026 08:00` — the WEB row breaks after the comma
 * and the MRN+date continue two lines down.
 *
 * ML accession numbers appear as standalone lines clustered at the top
 * of each page, one per row in the same top-to-bottom order.
 */

export interface BatchRow {
  order_no: string; // WEB… accession
  ml_accession: string | null;
  mayo_patient_id: string | null;
  patient_name: string | null;
  collected_at: string | null; // "15 Aug 2026 08:00"
  batch_no: string; // e.g. "52936901"
}

export interface ParsedBatchSheet {
  /** Top-level batch identifiers found on this manifest (a single PDF
   *  can contain multiple sub-batches split by shipping temp). */
  batches: string[];
  rows: BatchRow[];
  warnings: string[];
}

const ML_RE = /^ML\d{7,}[A-Z]?$/;
const BATCH_HEADER_RE = /^Batch\s+(\d{6,})$/i;
// Combined-row: WEB + "Last, First" + MRN + "DD Mmm YYYY HH:MM"
const ROW_RE = new RegExp(
  "^(WEB[A-Z0-9]{6,})\\s+(.+?)\\s+((?:1CJ|47R)[A-Z0-9]{5,})\\s+(\\d{1,2}\\s+[A-Z][a-z]{2}\\s+\\d{4}\\s+\\d{2}:\\d{2})$",
);
// Wrap-case start: `WEB LastPart1 LastPart2, FirstStart,` (name broke
// at the comma with no MRN on this line yet).
const ROW_WRAP_START_RE = new RegExp("^(WEB[A-Z0-9]{6,})\\s+(.+,)\\s*$");
// Wrap-case tail: `MRN DD Mmm YYYY HH:MM`.
const ROW_WRAP_END_RE = new RegExp(
  "^((?:1CJ|47R)[A-Z0-9]{5,})\\s+(\\d{1,2}\\s+[A-Z][a-z]{2}\\s+\\d{4}\\s+\\d{2}:\\d{2})$",
);

export async function parseBatchSheet(
  buffer: Buffer,
): Promise<ParsedBatchSheet> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const extracted = await extractText(pdf, { mergePages: false });
  const pagesRaw = Array.isArray(extracted.text)
    ? (extracted.text as string[])
    : [extracted.text as string];

  const batches: string[] = [];
  const rows: BatchRow[] = [];
  const warnings: string[] = [];

  for (const rawPage of pagesRaw) {
    const lines = rawPage
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Batch headers on this page
    const pageBatches: string[] = [];
    for (const line of lines) {
      const m = BATCH_HEADER_RE.exec(line);
      if (m) pageBatches.push(m[1]);
    }
    for (const b of pageBatches) if (!batches.includes(b)) batches.push(b);
    const currentBatch =
      pageBatches[0] ?? batches[batches.length - 1] ?? "unknown";

    // Collect ML accessions (standalone lines at the top of each page)
    const pageMls: string[] = [];
    for (const line of lines) if (ML_RE.test(line)) pageMls.push(line);

    // Extract patient rows — combined-format first, wrap-case second.
    const pageRows: Array<Omit<BatchRow, "batch_no" | "ml_accession">> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = ROW_RE.exec(line);
      if (m) {
        pageRows.push({
          order_no: m[1],
          patient_name: m[2].trim(),
          mayo_patient_id: m[3],
          collected_at: m[4],
        });
        continue;
      }
      const wrap = ROW_WRAP_START_RE.exec(line);
      if (wrap && i + 2 < lines.length) {
        const tail = ROW_WRAP_END_RE.exec(lines[i + 2]);
        if (tail) {
          pageRows.push({
            order_no: wrap[1],
            patient_name: `${wrap[2].trim()} ${lines[i + 1].trim()}`,
            mayo_patient_id: tail[1],
            collected_at: tail[2],
          });
          i += 2;
        }
      }
    }

    // Pair each row with the ML at the same top-to-bottom position.
    for (let i = 0; i < pageRows.length; i++) {
      rows.push({
        ...pageRows[i],
        ml_accession: pageMls[i] ?? null,
        batch_no: currentBatch,
      });
    }

    if (
      pageRows.length > 0 &&
      Math.abs(pageRows.length - pageMls.length) > 1
    ) {
      warnings.push(
        `Batch ${currentBatch}: ML pool (${pageMls.length}) doesn't line up with row count (${pageRows.length}); ML→row pairing may drift.`,
      );
    }
  }

  if (rows.length === 0) {
    throw new Error(
      "No patient rows extracted from the batch sheet. Confirm this is a Mayo Clinic printed batch manifest PDF (Order No. WEB… format).",
    );
  }

  return { batches, rows, warnings };
}
