import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ─── CORS + Origin allowlist ───────────────────────────────────────
// Both /api/insights/chat (JSON) and /api/insights/chat/stream (SSE)
// share the same allowlist. Streaming responses must carry the same
// CORS headers as JSON responses on every branch — including error
// branches. A stream that generates perfectly but is blocked at the
// browser boundary looks identical to a hang.
export const ALLOWED_ORIGINS = new Set<string>([
  "https://avovita.ca",
  "https://www.avovita.ca",
  "https://portal.avovita.ca",
  "http://localhost:3000",
  "http://localhost:3001",
]);

export function corsHeadersFor(
  origin: string | null,
): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Shared OPTIONS preflight handler. Missing / bad origins get 403 so
 * the caller's browser refuses the subsequent POST.
 */
export function handleOptions(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json(
      { error: origin ? "Origin not allowed" : "Origin header required" },
      { status: 403 },
    );
  }
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersFor(origin),
  });
}

// ─── Rate limiting (shared module-level state) ────────────────────
// Two layers: global daily cap (defeats per-IP rotation) + per-IP
// hourly cap (prevents one bad actor from burning the daily cap).
// Both maps are module-level so both /api/insights/chat and
// /api/insights/chat/stream share the same counters — a bad actor
// hitting the stream endpoint can't bypass the JSON endpoint's
// budget by rotating URLs.
export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ipHits = new Map<string, number[]>();

export const DAILY_CAP_MAX = 2000;
export const DAILY_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;
let dailyHits: number[] = [];

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function checkRateLimit(ip: string): {
  ok: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (arr.length >= RATE_LIMIT_MAX) {
    const oldest = arr[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  arr.push(now);
  ipHits.set(ip, arr);
  return { ok: true, retryAfterSec: 0 };
}

export function checkDailyCap(): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - DAILY_CAP_WINDOW_MS;
  dailyHits = dailyHits.filter((t) => t > cutoff);
  if (dailyHits.length >= DAILY_CAP_MAX) {
    const oldest = dailyHits[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + DAILY_CAP_WINDOW_MS - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  dailyHits.push(now);
  return { ok: true, retryAfterSec: 0 };
}

// ─── Test catalogue ───────────────────────────────────────────────
// Short compact catalogue block appended to the system prompt on
// every chat request. Module-level cache with 5-minute TTL that
// matches the Anthropic prompt-cache lifetime, so both refresh
// together — no extra coordination needed. Kit tests are marked
// with a trailing ` | KIT` so the model can skip the visit-fee
// language for them (see systemPrompt.ts).
const CATALOG_TTL_MS = 5 * 60 * 1000;
let cachedCatalog: { value: string; expiresAt: number } | null = null;

export async function buildTestCatalog(): Promise<string> {
  const now = Date.now();
  if (cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog.value;
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("tests")
      .select(
        "name, sku, price_cad, turnaround_display, collection_method, lab:labs(name)",
      )
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[chat] Failed to load tests from Supabase:", error.message);
      return cachedCatalog?.value ?? "";
    }

    type Row = {
      name: string;
      sku: string | null;
      price_cad: number | null;
      turnaround_display: string | null;
      collection_method: string | null;
      lab: { name: string } | { name: string }[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];

    const lines = rows.map((t) => {
      const lab = Array.isArray(t.lab) ? t.lab[0] : t.lab;
      const labName = lab?.name ?? "—";
      const code = t.sku ?? "—";
      const price =
        t.price_cad != null ? `$${t.price_cad} CAD` : "Contact us for pricing";
      const turnaround = (t.turnaround_display ?? "").trim();
      const turnaroundBit = turnaround ? ` | Turnaround: ${turnaround}` : "";
      const kitBit =
        t.collection_method === "self_collected_kit" ? " | KIT" : "";
      return `- ${t.name} | Code: ${code} | ${price} | Lab: ${labName}${turnaroundBit}${kitBit}`;
    });

    const value =
      "\n\n## AvoVita Test Directory\n\nThe following tests are available through AvoVita. You MUST only recommend tests from this list — never recommend a test that does not appear here.\n\n" +
      lines.join("\n");

    cachedCatalog = { value, expiresAt: now + CATALOG_TTL_MS };
    return value;
  } catch (err) {
    console.error("[chat] Unexpected error loading test catalog:", err);
    return cachedCatalog?.value ?? "";
  }
}

// ─── Request validation ───────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Parses + sanitises the request body common to both chat endpoints.
 * Returns either the cleaned message list or an error Response with
 * CORS headers already set. Callers early-return on the error branch.
 */
export async function parseChatBody(
  request: NextRequest,
  cors: Record<string, string>,
): Promise<
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid request body." },
        { status: 400, headers: cors },
      ),
    };
  }

  const body = raw as { messages?: unknown };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Messages array is required." },
        { status: 400, headers: cors },
      ),
    };
  }

  const sanitised = (body.messages as ChatMessage[])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.trim(),
    }));

  if (sanitised.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No valid messages provided." },
        { status: 400, headers: cors },
      ),
    };
  }

  return { ok: true, messages: sanitised };
}
