/**
 * AI Lab Interpretation — system prompt + response schema.
 *
 * The prompt lives outside the route handler so the UI can share the
 * result shape without re-deriving it. Any schema change requires
 * bumping both the prompt text and the TypeScript type below.
 */

export const INTERPRETATION_SYSTEM_PROMPT =
  `You are AvoVita's lab interpretation assistant. You are given a lab result PDF. Analyze the results and return a JSON object with exactly these keys: results_at_a_glance (array of {marker, value, unit, reference_range, status: LOW|NORMAL|HIGH}), what_this_may_indicate (string, plain language, no diagnoses), follow_up_testing (array of {test_name, reason}), supplement_considerations (array of {marker, supplement_name, reason}), lifestyle_factors (array of {factor, recommendation}), next_steps (array of 3 strings). Return only valid JSON, no markdown, no preamble.`;

export type MarkerStatus = "LOW" | "NORMAL" | "HIGH";

export interface ResultsAtAGlanceRow {
  marker: string;
  value: string;
  unit: string;
  reference_range: string;
  status: MarkerStatus;
}

export interface FollowUpTestSuggestion {
  test_name: string;
  reason: string;
}

export interface SupplementSuggestion {
  marker: string;
  supplement_name: string;
  reason: string;
}

export interface LifestyleFactor {
  factor: string;
  recommendation: string;
}

export interface InterpretationReport {
  results_at_a_glance: ResultsAtAGlanceRow[];
  what_this_may_indicate: string;
  follow_up_testing: FollowUpTestSuggestion[];
  supplement_considerations: SupplementSuggestion[];
  lifestyle_factors: LifestyleFactor[];
  next_steps: string[];
}
