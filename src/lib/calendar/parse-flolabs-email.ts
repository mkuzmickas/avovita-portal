/**
 * Parses a FloLabs / Acuity Scheduling booking confirmation email into
 * structured fields we can match to an AvoVita order.
 *
 * Input can be either the raw email body (paste from Outlook) or a
 * JSON payload from a future Power Automate webhook — same fields are
 * extracted either way.
 *
 * Format seen in the wild (Aug 2026 sample):
 *   Subject: Confirmation of Booking: AvoVita Wellness Mobile Lab
 *            Collection (Coleen Allydice) on Thursday, August 20,
 *            2026 10:00am MDT
 *   Body has an admin-only section with:
 *     Name: Coleen Allydice
 *     Phone: +14039919603
 *     Email: coleenallydice@gmail.com
 *   And a "When" line: Thursday, August 20, 2026 10:00am
 *   And a "Where" line: 388 Silverton Glen Green SW Ap#1530
 */

export interface ParsedFloLabsEmail {
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null; // E.164 if present
  address: string | null;
  /** ISO 8601 Calgary-local datetime, e.g. "2026-08-20T10:00:00-06:00". */
  appointmentAtISO: string | null;
  rawSubjectLine: string | null;
  warnings: string[];
}

export function parseFloLabsEmail(raw: string): ParsedFloLabsEmail {
  const warnings: string[] = [];
  const text = htmlToText(raw).replace(/\r\n/g, "\n");

  // Try subject line first — it has the most compact form.
  const subjectMatch = text.match(
    /Confirmation of Booking:\s*AvoVita[^(]*\(([^)]+)\)\s*on\s+([^\n]+?)(?:\s+M[SD]T)?\s*\n/i,
  );

  // Body-side extraction (admin section).
  //
  // Three template variants seen in the wild:
  //   - Confirmation-of-Booking email: has "Name: X" on its own line
  //     AND "(X)" in the subject.
  //   - Newer "Appointment Scheduled" template (Aug 2026+): opens with
  //     "Appointment Scheduled" then "for {First Last}" on the next line.
  //     No Name: line, no Email: line, subject doesn't carry the name.
  //   - Any HTML-ish paste where table cells collapsed onto one line.
  const nameFromBody =
    matchLine(text, /^\s*Name:\s*(.+?)\s*$/im) ??
    subjectMatch?.[1]?.trim() ??
    matchLine(
      text,
      /Appointment\s+(?:Scheduled|Rescheduled|Canceled|Cancelled)\s*\n\s*for\s+([A-Z][A-Za-z' -]+\s+[A-Z][A-Za-z' -]+)\s*$/im,
    ) ??
    matchLine(text, /^\s*for\s+([A-Z][A-Za-z' -]+\s+[A-Z][A-Za-z' -]+)\s*$/im) ??
    null;
  const clientEmail = matchLine(text, /^\s*Email:\s*(\S+@\S+)\s*$/im);
  const clientPhoneRaw = matchLine(text, /^\s*Phone:\s*(\+?[\d\s()-]+)\s*$/im);
  const clientPhone = clientPhoneRaw
    ? normalizePhone(clientPhoneRaw)
    : null;

  // Address: "Where" line OR fallback to the first non-empty line after
  // "Location\n============".
  const whereMatch = text.match(/^\s*Where\s+(.+?)\s*$/im);
  const locationBlock = text.match(
    /^\s*Location\s*\n=+\s*\n\s*(.+?)\s*(?:\n|$)/im,
  );
  const address =
    whereMatch?.[1]?.trim() ?? locationBlock?.[1]?.trim() ?? null;

  // Appointment datetime — try (in order): subject-line summary,
  // reschedule "New Time" line (Acuity's rescheduled template), then
  // the "When" line used by all other templates. Old Time is
  // intentionally not read — a reschedule notice always wins with the
  // new time, and the parser doesn't need to know about the old one.
  const dateSource =
    subjectMatch?.[2]?.trim() ??
    matchLine(text, /^\s*New\s+Time\s+(.+?)\s*$/im) ??
    matchLine(text, /^\s*When\s+(.+?)\s*$/im) ??
    null;
  const appointmentAtISO = dateSource
    ? parseAcuityDatetime(dateSource, warnings)
    : null;

  if (!nameFromBody) warnings.push("Could not extract client name.");
  if (!clientEmail) warnings.push("Could not extract client email.");
  if (!appointmentAtISO) warnings.push("Could not parse appointment time.");

  return {
    clientName: nameFromBody,
    clientEmail: clientEmail?.trim() ?? null,
    clientPhone,
    address,
    appointmentAtISO,
    rawSubjectLine: subjectMatch?.[0]?.trim().slice(0, 200) ?? null,
    warnings,
  };
}

function matchLine(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}

/**
 * Strip HTML tags, collapse entities, and normalise whitespace so the
 * text-only regexes in parseFloLabsEmail work on either an Outlook
 * HTML body or a plain-text paste. Blocks-level tags become newlines
 * so labels like "Name:" / "Phone:" survive on their own line.
 */
function htmlToText(raw: string): string {
  // Fast path: no tags → return as-is.
  if (!/<[^>]+>/.test(raw)) return raw;
  return (
    raw
      // Common block-level elements → newline
      .replace(/<\/?(p|div|br|tr|li|h[1-6])[^>]*>/gi, "\n")
      // Table cell separators → space so "Name: Coleen" doesn't collapse
      .replace(/<\/(td|th)>/gi, " ")
      // Strip everything else
      .replace(/<[^>]+>/g, "")
      // Decode a handful of common entities
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      // Collapse triple+ newlines / trailing spaces
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
  );
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.trim(); // leave alone if the shape is unexpected
}

/**
 * Parses Acuity's date-time format:
 *   "Thursday, August 20, 2026 10:00am"
 *   "August 20, 2026 10:00am MDT"
 * Returns a Calgary-local ISO 8601 timestamp.
 */
function parseAcuityDatetime(
  input: string,
  warnings: string[],
): string | null {
  const cleaned = input
    .replace(/M[SD]T\s*$/i, "")
    .replace(/^[A-Za-z]+,\s*/, "")
    .trim();
  // "August 20, 2026 10:00am" or "August 20, 2026 at 10:00am"
  const m = cleaned.match(
    /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+at)?\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i,
  );
  if (!m) {
    warnings.push(`Datetime format not recognised: "${input}".`);
    return null;
  }
  const [, monRaw, dayRaw, yearRaw, hRaw, minRaw, ampmRaw] = m;
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  const mm = months[monRaw.toLowerCase()];
  if (!mm) {
    warnings.push(`Unknown month "${monRaw}".`);
    return null;
  }
  let hour = parseInt(hRaw, 10);
  const min = parseInt(minRaw, 10);
  const ampm = ampmRaw.toLowerCase();
  if (ampm === "am" && hour === 12) hour = 0;
  if (ampm === "pm" && hour !== 12) hour += 12;

  const y = parseInt(yearRaw, 10);
  const d = parseInt(dayRaw, 10);
  const dateStr = `${y}-${pad2(mm)}-${pad2(d)}`;
  const timeStr = `${pad2(hour)}:${pad2(min)}:00`;
  const offset = calgaryOffsetFor(y, mm, d);
  return `${dateStr}T${timeStr}${offset}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function calgaryOffsetFor(y: number, m: number, d: number): string {
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "longOffset",
  }).formatToParts(probe);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-06:00";
  return raw.startsWith("GMT") ? raw.slice(3) : "-06:00";
}
