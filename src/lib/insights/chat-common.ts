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
  | { ok: true; messages: ChatMessage[]; raw: unknown }
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

  return { ok: true, messages: sanitised, raw };
}

/**
 * Parse the incoming body one level deeper — pull the widget's
 * session_id and (for engagement metrics) the message index. Both
 * are optional; portal traffic doesn't provide them because it uses
 * the client-side trackEvent path which already stamps session_id
 * from AnalyticsProvider.
 *
 * Kept as its own small parse because parseChatBody early-returns on
 * error and consumes the JSON body — we can't re-read it.
 */
export function extractSessionMetadata(
  raw: unknown,
): { session_id: string | null; message_index: number | null } {
  if (!raw || typeof raw !== "object") {
    return { session_id: null, message_index: null };
  }
  const body = raw as { session_id?: unknown; messages?: unknown };
  const session_id =
    typeof body.session_id === "string" && body.session_id.trim().length > 0
      ? body.session_id.trim().slice(0, 64)
      : null;
  const message_index = Array.isArray(body.messages)
    ? body.messages.length
    : null;
  return { session_id, message_index };
}

/**
 * Fire-and-forget analytics_events insert for widget chat traffic.
 * Portal chat traffic uses the client-side trackEvent hook instead —
 * this exists so the marketing-site widget (cross-origin, no shared
 * React analytics context) still shows up in the same dashboard
 * bucket. `surface: "widget"` distinguishes the two in queries.
 *
 * Never throws — analytics failures must not fail a chat request.
 */
export async function recordWidgetChatEvent(
  origin: string | null,
  sessionId: string | null,
  messageIndex: number | null,
): Promise<void> {
  // Skip when the request came from the portal itself — the portal
  // modal fires its own client-side ai_message_sent with surface:
  // "portal", so inserting a server-side duplicate here would
  // double-count. Anything from avovita.ca (or any other allowed
  // widget origin) gets logged.
  if (!origin) return;
  if (origin.includes("portal.avovita.ca")) return;
  if (!sessionId) return;

  try {
    const supabase = createServiceRoleClient();
    await supabase.from("analytics_events").insert({
      event_type: "ai_message_sent",
      event_data: {
        surface: "widget",
        message_index: messageIndex,
        origin,
      },
      path: null,
      session_id: sessionId,
      org_id: null,
      account_id: null,
    });
  } catch (err) {
    console.warn("[chat-common] recordWidgetChatEvent failed:", err);
  }
}
