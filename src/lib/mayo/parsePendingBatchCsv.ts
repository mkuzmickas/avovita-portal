/**
 * Parses Mayo's Pending Batch CSV (the file exported from the
 * MayoLINK "Download list" button on the Pending Batch view) into
 * a row-per-order structure the matching engine can consume.
 *
 * Mayo's CSV is a standard quoted CSV but the "Tests Ordered" column
 * holds multiple tests separated by newlines INSIDE a single quoted
 * cell — so the file as a whole has fewer logical rows than physical
 * lines. The parser walks character-by-character to respect quotes,
 * then unfolds the multi-line tests column per row.
 *
 * Each test line inside that cell looks like:
 *   "CSTCE Cystatin C with Estimated Glomerular Filtration Rate ..."
 * The convention is "SKU<whitespace>Full name"; we split on the first
 * whitespace run. Defensive on edge cases — a line with no whitespace
 * is treated as SKU-only; a blank line is skipped; a line whose
 * "SKU" looks like prose (no caps/digits) is flagged as a warning on
 * the row but not dropped, since the human admin can still triage.
 *
 * Pure: no Node FS, no DOM File API — accepts raw text. The route
 * handler reads the uploaded File and hands the text in.
 */

export interface ParsedTest {
  /** Mayo's short code, e.g. "CSTCE". */
  sku: string;
  /** Full descriptive name from the line. */
  name: string;
}

export interface ParsedPendingBatchRow {
  account_number: string;
  /** Mayo's WEB-style order id, e.g. "WEBQ65R9YL2M". */
  mayo_order_number: string;
  /** Mayo's MRN, e.g. "1CJ5UL2J8". */
  mayo_patient_id: string;
  /** Original date string from the CSV — left as text so the matching
   *  engine can normalize. Null if cell was empty. */
  collection_date: string | null;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  /** Original DOB string from the CSV, e.g. "30 Nov 1982". */
  date_of_birth: string;
  sex: "M" | "F" | null;
  tests: ParsedTest[];
  status: string;
  /** Original creation timestamp from the CSV, left as text. */
  created_at: string;
  /** Per-row parse warnings — surfaced in the UI alongside the row
   *  but the row is still included so admin can decide. */
  warnings: string[];
}

export interface ParsedPendingBatchCsv {
  valid: boolean;
  /** File-level errors (missing columns, zero parseable rows). */
  errors: string[];
  rows: ParsedPendingBatchRow[];
}

/**
 * Column names we require to be present in the header. Matched
 * case-insensitively and trimmed. Mayo's column order has been
 * stable but we lookup-by-name rather than positionally for safety.
 */
const REQUIRED_COLUMNS = [
  "Account Number",
  "Order Number",
  "Medical Record Number",
  "Last Name",
  "First Name",
  "Date of Birth",
  "Tests Ordered",
  "Status",
] as const;

/**
 * Splits a CSV text into rows, then each row into fields. Honours
 * RFC-4180 style double-quote escaping and embedded newlines inside
 * quoted cells (which is how Mayo packs the "Tests Ordered" list).
 */
function splitCsv(text: string): string[][] {
  // Strip a UTF-8 BOM if Excel left one behind.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        // Doubled quote inside quoted cell = literal quote.
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (c === "\r") {
      // swallow — handled by \n
      continue;
    }
    if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }
  // Trailing cell / row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop completely empty rows (no fields or one empty field).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/**
 * Pulls SKU + descriptive name out of one line of the "Tests Ordered"
 * cell. Convention is "<SKU><whitespace><name>". A line with no
 * whitespace is SKU-only. Returns null for blank lines so the caller
 * can skip them.
 */
function parseTestLine(rawLine: string): ParsedTest | null {
  const line = rawLine.trim();
  if (line.length === 0) return null;

  const match = line.match(/^(\S+)(?:\s+(.+))?$/);
  if (!match) return null;
  return {
    sku: match[1],
    name: (match[2] ?? "").trim() || match[1],
  };
}

/**
 * Internal: looks up the value of a named column on a row, given the
 * header map. Returns the trimmed text or empty string.
 */
function cell(
  row: string[],
  headerMap: Map<string, number>,
  name: string,
): string {
  const idx = headerMap.get(name.toLowerCase());
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
}

export function parsePendingBatchCsv(text: string): ParsedPendingBatchCsv {
  const errors: string[] = [];

  if (!text || text.trim().length === 0) {
    return {
      valid: false,
      errors: ["CSV file is empty"],
      rows: [],
    };
  }

  const rows = splitCsv(text);
  if (rows.length === 0) {
    return {
      valid: false,
      errors: ["CSV file has no rows"],
      rows: [],
    };
  }

  // Header row — case-insensitive lookup.
  const headers = rows[0].map((h) => h.trim());
  const headerMap = new Map<string, number>();
  headers.forEach((h, i) => headerMap.set(h.toLowerCase(), i));

  // Required columns check.
  const missing = REQUIRED_COLUMNS.filter(
    (c) => !headerMap.has(c.toLowerCase()),
  );
  if (missing.length > 0) {
    errors.push(
      `Missing required column(s): ${missing.join(", ")}. ` +
        `Make sure you exported from the MayoLINK "Pending Batch" ` +
        `view with the standard column set.`,
    );
    return { valid: false, errors, rows: [] };
  }

  const parsed: ParsedPendingBatchRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const warnings: string[] = [];

    const orderNum = cell(row, headerMap, "Order Number");
    const mrn = cell(row, headerMap, "Medical Record Number");
    const lastName = cell(row, headerMap, "Last Name");
    const firstName = cell(row, headerMap, "First Name");
    const dob = cell(row, headerMap, "Date of Birth");
    const testsCell = cell(row, headerMap, "Tests Ordered");

    // Skip totally-blank trailing rows that some exporters add.
    if (
      !orderNum &&
      !mrn &&
      !lastName &&
      !firstName &&
      !dob &&
      !testsCell
    ) {
      continue;
    }

    if (!orderNum) warnings.push("missing Order Number");
    if (!mrn) warnings.push("missing Medical Record Number");
    if (!lastName) warnings.push("missing Last Name");
    if (!firstName) warnings.push("missing First Name");
    if (!dob) warnings.push("missing Date of Birth");

    const tests: ParsedTest[] = [];
    if (testsCell) {
      const lines = testsCell.split(/\r?\n/);
      for (const line of lines) {
        const t = parseTestLine(line);
        if (t) tests.push(t);
      }
      if (tests.length === 0) {
        warnings.push("Tests Ordered cell could not be parsed");
      }
    } else {
      warnings.push("no Tests Ordered");
    }

    const sexRaw = cell(row, headerMap, "Sex").toUpperCase();
    const sex: "M" | "F" | null =
      sexRaw === "M" ? "M" : sexRaw === "F" ? "F" : null;

    parsed.push({
      account_number: cell(row, headerMap, "Account Number"),
      mayo_order_number: orderNum,
      mayo_patient_id: mrn,
      collection_date: cell(row, headerMap, "Collection Date") || null,
      last_name: lastName,
      first_name: firstName,
      middle_name: cell(row, headerMap, "Middle Name") || null,
      date_of_birth: dob,
      sex,
      tests,
      status: cell(row, headerMap, "Status"),
      created_at: cell(row, headerMap, "Created At"),
      warnings,
    });
  }

  if (parsed.length === 0) {
    errors.push("CSV has no data rows after the header");
    return { valid: false, errors, rows: [] };
  }

  return { valid: true, errors, rows: parsed };
}
