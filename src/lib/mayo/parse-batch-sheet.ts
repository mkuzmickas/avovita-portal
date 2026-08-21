import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Mayo Clinic Laboratories PRINTED BATCH SHEET parser.
 *
 * Different beast from the invoice parser — this is the shipment
 * manifest that goes IN the FedEx box (see the sample Mike shared:
 * "Batch 52936901" through "…903", each with the barcode
 * "C7044716-52936901-RST-F"). Structure per patient row:
 *
 *   Order No.        WEBQ65RVUCM4
 *   Patient Name     Dias, Deborah
 *   Patient ID       1CJ589RKQ
 *   Collected/Phys.  15 Aug 2026 08:00
 *   Sex              F
 *   DOB              10/01/1970
 *   Accession No.    ML13931439  (renders as a barcode label near the row)
 *   Tests            FRT3S T3 Reverse ... (indented below)
 *
 * We only need the identity fields to match against orders — WEB
 * accession lives in orders.mayo_order_number, ML accession in
 * orders.mayo_ml_order_number, and the MRN in orders.mayo_patient_id
 * (all populated either by Pipeline 1 historically or by the Mayo
 * invoice matcher backstamp we ship on match).
 *
 * PDF text extraction gives us WEB codes, ML codes, and MRN codes all
 * on separate lines in an unpredictable order relative to the row's
 * name. We collect them into pools per page, then pair them up by
 * position — reliable because Mayo prints one WEB / one ML / one MRN
 * per row in the same order top-to-bottom.
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

const WEB_RE = /WEB[A-Z0-9]{6,}/;
const ML_RE = /^ML\d{7,}[A-Z]?$/;
const MRN_RE = /^(?:1CJ|47R)[A-Z0-9]{5,}$/;
const BATCH_HEADER_RE = /^Batch\s+(\d{6,})$/i;
// Patient name — Mayo prints "LAST, FIRST" (may have multi-word last
// name like "Bravo Jaraba, Meris Coromoto"). Match anything ending
// with a lowercase letter that also contains a comma.
const NAME_RE = /^[A-Z][A-Za-z' -]+,\s*[A-Z][A-Za-z' -]+$/;
const COLLECTED_RE =
  /^\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}$/;

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

    // Find batch identifiers on this page
    const pageBatches: string[] = [];
    for (const line of lines) {
      const m = BATCH_HEADER_RE.exec(line);
      if (m) pageBatches.push(m[1]);
    }
    for (const b of pageBatches) if (!batches.includes(b)) batches.push(b);
    // If no batch header on the page, the whole PDF might be a
    // single-batch layout — fall back to whatever batch(es) we've
    // seen so far.
    const currentBatch =
      pageBatches[0] ?? batches[batches.length - 1] ?? "unknown";

    // Collect per-page pools of each ID type + names + collected timestamps
    const webs: string[] = [];
    const mls: string[] = [];
    const mrns: string[] = [];
    const names: string[] = [];
    const collecteds: string[] = [];

    for (const line of lines) {
      // Skip known non-data lines
      if (
        /^FROM|^TO|^Order No\.|^Patient (Name|ID)|^Collected|^Printed|^Page \d+ of|Mayo Clinic Laboratories/i.test(
          line,
        )
      ) {
        continue;
      }
      if (BATCH_HEADER_RE.test(line)) continue;
      if (line === "Frozen" || line === "Refrigerated" || line === "Ambient")
        continue;

      // Some fields appear standalone; others share a line. Try match
      // in order of specificity.
      if (WEB_RE.test(line) && line === (WEB_RE.exec(line)?.[0] ?? "")) {
        webs.push(line);
        continue;
      }
      if (ML_RE.test(line)) {
        mls.push(line);
        continue;
      }
      if (MRN_RE.test(line)) {
        mrns.push(line);
        continue;
      }
      if (COLLECTED_RE.test(line)) {
        collecteds.push(line);
        continue;
      }
      if (NAME_RE.test(line) && line.length <= 60) {
        names.push(line);
        continue;
      }
    }

    // Pair up: patient rows are printed in the same order top-to-
    // bottom, one WEB per row. Some rows on subsequent pages of the
    // same manifest don't reprint the ML accession (Mayo shows the
    // barcode inline once), so we treat mls / mrns / names /
    // collecteds as best-effort by index.
    for (let i = 0; i < webs.length; i++) {
      rows.push({
        order_no: webs[i],
        ml_accession: mls[i] ?? null,
        mayo_patient_id: mrns[i] ?? null,
        patient_name: names[i] ?? null,
        collected_at: collecteds[i] ?? null,
        batch_no: currentBatch,
      });
    }

    // Sanity warning if the counts are wildly out of sync
    if (
      webs.length > 0 &&
      (Math.abs(webs.length - names.length) > 2 ||
        Math.abs(webs.length - mrns.length) > 2)
    ) {
      warnings.push(
        `Page pool sizes mismatch (WEB=${webs.length} names=${names.length} MRN=${mrns.length} ML=${mls.length}) — some rows may be missing metadata but their WEB accession is still captured.`,
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
