/**
 * Custom-line validation + sanitization.
 *
 * Used server-side wherever a custom-line array is accepted from the
 * client (PATCH quote, accept-quote → cart). Centralised so the spec's
 * validation rules (description 1-100, amount ±10000, notes ≤500) are
 * applied identically everywhere — no duplicated regexes or bound
 * checks. The same gotcha that motivated the GST single-source-of-
 * truth and out-of-town fee plumbing.
 */

import type { CustomQuoteLine } from "@/types/database";

/** Loose shape of an admin-submitted custom line. Server narrows it. */
export interface CustomQuoteLineInput {
  description?: unknown;
  amount_cad?: unknown;
  notes?: unknown;
}

const DESC_MAX = 100;
const NOTES_MAX = 500;
const AMOUNT_MIN = -10_000;
const AMOUNT_MAX = 10_000;

/**
 * Strip < and > from a description so a malicious admin (or a paste
 * from a rich-text source) can't inject markup into the customer-
 * facing email / Stripe product name. Email + cart renderers all
 * additionally escape, so this is defence-in-depth.
 */
function stripAngles(s: string): string {
  return s.replace(/[<>]/g, "");
}

export type SanitizeResult =
  | { ok: true; lines: CustomQuoteLine[] }
  | { ok: false; error: string };

export function sanitizeCustomLines(
  raw: CustomQuoteLineInput[] | null | undefined
): SanitizeResult {
  if (raw === null || raw === undefined) return { ok: true, lines: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "custom_lines must be an array" };
  }

  const out: CustomQuoteLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: `custom_lines[${i}] is not an object` };
    }
    const descRaw =
      typeof entry.description === "string" ? entry.description.trim() : "";
    const description = stripAngles(descRaw);
    if (description.length === 0) {
      return {
        ok: false,
        error: `custom_lines[${i}]: description is required`,
      };
    }
    if (description.length > DESC_MAX) {
      return {
        ok: false,
        error: `custom_lines[${i}]: description exceeds ${DESC_MAX} chars`,
      };
    }

    const amountNum =
      typeof entry.amount_cad === "number"
        ? entry.amount_cad
        : Number(entry.amount_cad);
    if (!Number.isFinite(amountNum)) {
      return {
        ok: false,
        error: `custom_lines[${i}]: amount_cad must be a finite number`,
      };
    }
    if (amountNum < AMOUNT_MIN || amountNum > AMOUNT_MAX) {
      return {
        ok: false,
        error: `custom_lines[${i}]: amount_cad must be between ${AMOUNT_MIN} and ${AMOUNT_MAX}`,
      };
    }
    // Round to 4dp per spec — keeps Stripe cents math from drifting.
    const amount_cad = Math.round(amountNum * 10_000) / 10_000;

    let notes: string | null = null;
    if (typeof entry.notes === "string" && entry.notes.trim().length > 0) {
      const trimmed = entry.notes.trim();
      if (trimmed.length > NOTES_MAX) {
        return {
          ok: false,
          error: `custom_lines[${i}]: notes exceed ${NOTES_MAX} chars`,
        };
      }
      notes = trimmed;
    }

    out.push({ description, amount_cad, notes });
  }
  return { ok: true, lines: out };
}
