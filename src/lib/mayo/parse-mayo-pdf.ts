import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Mayo Clinic Laboratories monthly-invoice PDF parser.
 *
 * unpdf gives us a linear text stream where the visual table columns
 * have collapsed. Two specific column-collapse artifacts we normalize
 * before parsing:
 *
 *   1. Accession + collection date get jammed together:
 *      "ML1356787904/09/2026" → we insert a space so it becomes
 *      "ML13567879 04/09/2026".
 *
 *   2. Mayo Patient ID + specimen number get jammed together:
 *      "1CJ55X3RWWEBQ65R9J6YX" → "1CJ55X3RW WEBQ65R9J6YX".
 *
 * Then we parse line-by-line with a rolling "current patient" context.
 * The header block, page footers, and payment/balance rows all sit
 * on their own lines and never match the row regexes, so they get
 * ignored automatically.
 *
 * Panel-component rows (no leading test id, just an indented CPT +
 * description with no charge) are skipped — only the charged parent
 * line survives, which matches Mayo's own billing model.
 */

export interface ParsedInvoiceLine {
  collection_date: string; // YYYY-MM-DD
  accession_no: string;
  specimen_no: string | null;
  mayo_patient_id: string | null;
  patient_name: string;
  test_id: string;
  cpt: string | null;
  description: string | null;
  charge_usd: number;
}

export interface ParsedInvoice {
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD
  total_usd: number;
  lines: ParsedInvoiceLine[];
}

const DATE_RE = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(20\d{2})$/;
const ACCESSION_RE = /ML\d{7,}[A-Z]?/;
const PATIENT_ID_RE = /(?:1CJ|47R)[A-Z0-9]{5,}/;
const SPECIMEN_RE = /WEB[A-Z0-9]{6,}/;
// Mayo test IDs are 2-7 uppercase alphanumerics/underscores, e.g. T3, PSA,
// CBC, 25HDN, T4FT4, ZN_S, CRMP1, HBA1C. They can start with a digit
// (25HDN). To distinguish from CPT codes (pure 4-5 digits), we require
// at least one letter — the positive lookahead does exactly that.
const TEST_ID_RE = /^(?=.*[A-Z])[A-Z0-9][A-Z0-9_]{1,6}$/;
const CPT_RE = /^(?:\d{4,5}|[A-Z]\d{4})[A-Z]?$/;
const MONEY_END_RE = /([\d,]+\.\d{2})$/;

function normalizeDate(mmddyyyy: string): string | null {
  const m = DATE_RE.exec(mmddyyyy);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function parseMoney(s: string): number {
  const n = parseFloat(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.abs(n) : NaN;
}

/**
 * Split "LAST, FIRST [MIDDLE...] TEST_ID [CPT] rest" into
 * (patient_name, [test_id, ...rest]). Uses a two-pass strategy:
 *
 *   1. CPT-lookahead: find the first CPT-shaped token in the tail.
 *      test_id sits immediately before it; everything before that is
 *      the patient name. This is bullet-proof for the 90%+ of rows
 *      where a CPT is present (non-panel tests).
 *
 *   2. No-CPT fallback (panel parent rows like "T4FT4 T4 (Thyroxine)…"):
 *      last name = tokens up to and including the comma-terminated
 *      token; first name = next single token; test_id = the token
 *      after that. This mis-attributes 2-token first names on panel
 *      rows (e.g. "MERIS COROMOTO"), which is rare — Mike can hand-
 *      fix via JSON upload.
 */
function splitNameAndRest(tokens: string[]): {
  name: string;
  rest: string[];
} {
  // Pass 1 — CPT lookahead
  const cptIdx = tokens.findIndex((t, i) => i > 0 && CPT_RE.test(t));
  let boundary = -1;
  if (cptIdx > 0) {
    boundary = cptIdx - 1; // test_id lives immediately before CPT
  } else {
    // Pass 2 — no CPT: find the last-name terminator (a token ending in ",")
    // then step past exactly one first-name token to land on test_id.
    const commaIdx = tokens.findIndex((t) => t.endsWith(","));
    if (commaIdx >= 0 && commaIdx + 2 < tokens.length) {
      boundary = commaIdx + 2;
    }
  }
  if (boundary <= 0) {
    // Can't determine boundary — treat everything as name (which will
    // cause the parseTestTail() call to return null and this row to
    // be dropped).
    return { name: tokens.join(" "), rest: [] };
  }
  const nameTokens = tokens.slice(0, boundary);
  return {
    name: nameTokens.join(" ").replace(/\s+,/g, ",").trim(),
    rest: tokens.slice(boundary),
  };
}

/**
 * Parse the tail-portion of a line — starts with test_id, then optional
 * CPT, then description tokens, ending with the charge. Returns null
 * when there's no trailing money (panel component row).
 */
function parseTestTail(tokens: string[]): {
  test_id: string;
  cpt: string | null;
  description: string | null;
  charge_usd: number;
} | null {
  if (tokens.length === 0) return null;
  const test_id = tokens[0];
  if (!TEST_ID_RE.test(test_id)) return null;

  // Charge is the last money-shaped token on the line.
  const last = tokens[tokens.length - 1];
  const m = MONEY_END_RE.exec(last);
  if (!m) return null;
  const charge_usd = parseMoney(m[1]);
  if (!Number.isFinite(charge_usd) || charge_usd <= 0) return null;

  const middle = tokens.slice(1, -1);
  let cpt: string | null = null;
  let descTokens = middle;
  if (middle.length > 0 && CPT_RE.test(middle[0])) {
    cpt = middle[0];
    descTokens = middle.slice(1);
  }
  return {
    test_id,
    cpt,
    description: descTokens.length > 0 ? descTokens.join(" ") : null,
    charge_usd,
  };
}

export async function parseMayoPdf(buffer: Buffer): Promise<ParsedInvoice> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  // mergePages: true → unpdf returns a single string; the union type in
  // the .d.ts is (string | string[]) but the value is always string
  // when this flag is set.
  const extracted = await extractText(pdf, { mergePages: true });
  const raw = Array.isArray(extracted.text)
    ? (extracted.text as string[]).join("\n")
    : (extracted.text as string);

  // Column-collapse fixes (see file header for why).
  const text = raw
    .replace(
      new RegExp(`(${ACCESSION_RE.source})(\\d{2}\\/\\d{2}\\/20\\d{2})`, "g"),
      "$1 $2",
    )
    .replace(
      new RegExp(`(${PATIENT_ID_RE.source})(${SPECIMEN_RE.source})`, "g"),
      "$1 $2",
    );

  // ─── Header extraction ──────────────────────────────────────────
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Invoice number: first standalone line matching \d{7,}-\d{6}.
  const invNumLine = lines.find((l) => /^\d{7,}-\d{6}$/.test(l));
  if (!invNumLine) throw new Error("Could not find Invoice Number in PDF.");
  const invoice_number = invNumLine;

  // Invoice date: first standalone MM/DD/YYYY line in the doc.
  const invDateLine = lines.find((l) => DATE_RE.test(l));
  const invoice_date = invDateLine ? normalizeDate(invDateLine) : null;
  if (!invoice_date) throw new Error("Could not find invoice Date in PDF.");

  // Grand Total: prefer the labeled summary; fall back to footer.
  let total_usd = NaN;
  const grand = /Grand Total\s+\$([\d,]+\.\d{2})/i.exec(text);
  if (grand) {
    total_usd = parseMoney(grand[1]);
  } else {
    const footer = [
      ...text.matchAll(
        /\$([\d,]+\.\d{2})\s+\$[\d,]+\.\d{2}\s+\$0\.00\s+\$0\.00\s+\$0\.00/g,
      ),
    ];
    if (footer.length > 0) {
      total_usd = parseMoney(footer[footer.length - 1][1]);
    }
  }
  if (!Number.isFinite(total_usd)) {
    throw new Error("Could not extract Grand Total from PDF.");
  }

  // ─── Body extraction (line-based state machine) ─────────────────
  let cur: {
    collection_date: string;
    accession_no: string;
    specimen_no: string | null;
    mayo_patient_id: string | null;
    patient_name: string;
  } | null = null;

  const results: ParsedInvoiceLine[] = [];

  for (const line of lines) {
    // Skip explicit payment / balance rows early to avoid the "-5,806.39"
    // AMEX credit being mistaken for a $5806.39 test charge.
    if (
      /^Previous Balance/i.test(line) ||
      /AMEX Transaction ID/i.test(line) ||
      /FEE ADJUSTMENT/i.test(line) ||
      /^Subtotal Client/i.test(line) ||
      /^Total Current Statement/i.test(line) ||
      /^Grand Total\s/i.test(line)
    ) {
      continue;
    }

    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    // Case 1: this is a NEW patient/accession row.
    // Layout after our column-unjam: `ML####### MM/DD/YYYY [PID] [WEB…] LAST, FIRST TESTID … CHARGE`
    if (ACCESSION_RE.test(tokens[0]) && tokens.length >= 2 && DATE_RE.test(tokens[1])) {
      const accession_no = tokens[0];
      const collection_date = normalizeDate(tokens[1]);
      if (!collection_date) continue;
      let idx = 2;

      // Optional Mayo patient id, then specimen.
      let mayo_patient_id: string | null = null;
      let specimen_no: string | null = null;
      if (idx < tokens.length && PATIENT_ID_RE.test(tokens[idx])) {
        mayo_patient_id = tokens[idx];
        idx++;
      }
      if (idx < tokens.length && SPECIMEN_RE.test(tokens[idx])) {
        specimen_no = tokens[idx];
        idx++;
      }
      // Some rows are ordered `specimen, patient_id` instead (rare); handle
      // by swapping if that's what we see.
      if (
        idx < tokens.length &&
        !mayo_patient_id &&
        SPECIMEN_RE.test(tokens[idx - 1] ?? "") &&
        PATIENT_ID_RE.test(tokens[idx])
      ) {
        mayo_patient_id = tokens[idx];
        idx++;
      }

      const { name, rest } = splitNameAndRest(tokens.slice(idx));
      cur = {
        collection_date,
        accession_no,
        specimen_no,
        mayo_patient_id,
        patient_name: name,
      };
      const tail = parseTestTail(rest);
      if (tail) {
        results.push({
          ...cur,
          ...tail,
        });
      }
      continue;
    }

    // Case 2: continuation test row for the current patient.
    // Layout: `TESTID [CPT] description CHARGE`
    if (cur && TEST_ID_RE.test(tokens[0])) {
      const tail = parseTestTail(tokens);
      if (tail) {
        results.push({
          ...cur,
          ...tail,
        });
      }
      continue;
    }
    // Everything else (headers, page footers, panel-component CPT rows,
    // description continuations) is silently ignored.
  }

  if (results.length === 0) {
    throw new Error(
      "PDF parsed but no line items extracted. Format may have drifted — fall back to JSON upload.",
    );
  }

  // Dedup on (accession, test_id) — the same accession can appear on
  // successive pages when Mayo breaks a patient block across pages.
  const seen = new Set<string>();
  const deduped: ParsedInvoiceLine[] = [];
  for (const l of results) {
    const key = `${l.accession_no}|${l.test_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(l);
  }

  return {
    invoice_number,
    invoice_date,
    total_usd,
    lines: deduped,
  };
}
