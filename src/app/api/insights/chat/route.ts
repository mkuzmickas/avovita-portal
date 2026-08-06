import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";

export const runtime = "nodejs";

const CATALOG_TTL_MS = 5 * 60 * 1000;

// ─── CORS + Origin allowlist ───────────────────────────────────────
// Browser widgets on the AvoVita marketing site (avovita.ca) need to
// call this route directly, so we return CORS headers for known
// AvoVita origins. Server-to-server callers (no Origin header) are
// allowed through unchanged — the existing per-IP rate limit is the
// abuse guard there. Origins outside the allowlist get 403'd so
// random third-party sites can't burn our Anthropic budget from a
// browser.
//
// Origin is set automatically by the browser and cannot be forged
// from client JS, so this allowlist meaningfully protects the
// browser-side attack surface. It does not stop determined server-
// side scripts (which can send any Origin header); those are still
// gated by the IP rate limit below.
const ALLOWED_ORIGINS = new Set<string>([
  "https://avovita.ca",
  "https://www.avovita.ca",
  "https://portal.avovita.ca",
  "http://localhost:3000", // dev
  "http://localhost:3001", // dev alt
]);

function corsHeadersFor(origin: string | null): Record<string, string> {
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
 * Preflight handler. Browsers issue OPTIONS before any cross-origin
 * POST with a non-simple content type. Origin is required and must
 * be in the allowlist; missing / bad origins get 403 (no CORS
 * headers) so the caller's browser refuses the subsequent POST.
 */
export async function OPTIONS(request: NextRequest) {
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

// ─── Rate limiting ─────────────────────────────────────────────────
// Two layers stacked:
//
//   1. Global daily cap. In-memory sliding window across the whole
//      endpoint. This is the real defense against per-IP rotation
//      (which defeats any per-IP limit no matter how low). Set well
//      above honest daily traffic — its only job is to stop a bad
//      night from becoming a bad Anthropic invoice. In-memory means
//      it resets on serverless cold starts, which is acceptable for
//      a safety net.
//
//   2. Per-IP hourly cap. Prevents a single bad actor from burning
//      through the global cap before it can trip. Raised from 10/hr
//      to 30/hr now that we also require Origin — a NAT'd household
//      or office sharing one public IP has room to use the widget.
//
// Both are in-memory sliding windows; maps reset on cold start. For
// a stricter absolute cap swap to Upstash Redis or Vercel KV later.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ipHits = new Map<string, number[]>();

const DAILY_CAP_MAX = 2000;
const DAILY_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;
let dailyHits: number[] = [];

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(ip: string): {
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
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000)
    );
    return { ok: false, retryAfterSec };
  }
  arr.push(now);
  ipHits.set(ip, arr);
  return { ok: true, retryAfterSec: 0 };
}

function checkDailyCap(): { ok: boolean; retryAfterSec: number } {
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

let cachedCatalog: { value: string; expiresAt: number } | null = null;

async function buildTestCatalog(): Promise<string> {
  const now = Date.now();
  if (cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog.value;
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("tests")
      .select(
        "name, sku, price_cad, turnaround_display, lab:labs(name)",
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
      lab: { name: string } | { name: string }[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];

    // Short compact line per test so the whole catalogue fits in a
    // reasonable slice of the prompt window. Turnaround is included
    // so the AI can answer "how long for results?" without having to
    // fall back to "check the catalogue page" — the outside advisor
    // flagged that as one of the two facts the model was missing.
    // Kept to short pipe-separated fields to stay token-cheap on
    // every call (this catalog is re-sent per request).
    const lines = rows.map((t) => {
      const lab = Array.isArray(t.lab) ? t.lab[0] : t.lab;
      const labName = lab?.name ?? "—";
      const code = t.sku ?? "—";
      const price =
        t.price_cad != null ? `$${t.price_cad} CAD` : "Contact us for pricing";
      const turnaround = (t.turnaround_display ?? "").trim();
      const turnaroundBit = turnaround ? ` | Turnaround: ${turnaround}` : "";
      return `- ${t.name} | Code: ${code} | ${price} | Lab: ${labName}${turnaroundBit}`;
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  // ─── Origin allowlist ────────────────────────────────────────────
  // Required. Same-origin browser POSTs (portal's own Ask AvoVita)
  // send an Origin header; the marketing-site widget will too. The
  // only category we'd cut off by requiring it is server-to-server
  // callers with no legitimate purpose on this route (uptime
  // monitors don't POST here). Making it mandatory closes the
  // "just skip the Origin header" bypass that per-IP rate limits
  // can't stop.
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json(
      { error: origin ? "Origin not allowed" : "Origin header required" },
      { status: 403 },
    );
  }
  const cors = corsHeadersFor(origin);

  // ─── Global daily cap ───────────────────────────────────────────
  // Absolute ceiling on total requests across ALL IPs in a 24h
  // rolling window. Defeats per-IP rotation, which the per-IP cap
  // below can't. Set well above honest traffic; only exists to stop
  // an incident from becoming a bad Anthropic invoice.
  const dc = checkDailyCap();
  if (!dc.ok) {
    return NextResponse.json(
      {
        error:
          "Ask AvoVita is temporarily paused due to unusually high usage. Please try again later or email support@avovita.ca for help.",
      },
      {
        status: 429,
        headers: {
          ...cors,
          "Retry-After": String(dc.retryAfterSec),
          "X-RateLimit-Scope": "endpoint-daily",
        },
      },
    );
  }

  // ─── Per-IP hourly cap ─────────────────────────────────────────
  const ip = clientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded — try again in ${rl.retryAfterSec} second${rl.retryAfterSec === 1 ? "" : "s"}.`,
      },
      {
        status: 429,
        headers: {
          ...cors,
          "Retry-After": String(rl.retryAfterSec),
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Scope": "per-ip-hourly",
        },
      }
    );
  }

  let messages: ChatMessage[];
  try {
    const body = await request.json();
    messages = body.messages;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400, headers: cors },
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages array is required." },
      { status: 400, headers: cors },
    );
  }

  const sanitised = messages
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.trim() }));

  if (sanitised.length === 0) {
    return NextResponse.json(
      { error: "No valid messages provided." },
      { status: 400, headers: cors },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log("[chat] ANTHROPIC_API_KEY exists:", !!apiKey);
  if (!apiKey) {
    console.error("[chat] ANTHROPIC_API_KEY is not set — check .env.local and restart the dev server.");
    return NextResponse.json(
      { error: "AI service is not configured. Contact support." },
      { status: 503, headers: cors },
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const catalog = await buildTestCatalog();
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT + catalog,
      messages: sanitised,
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : null;
    if (!text) {
      console.error("[chat] Unexpected response shape:", JSON.stringify(message));
      return NextResponse.json(
        { error: "Received an unexpected response from the AI. Please try again." },
        { status: 502, headers: cors },
      );
    }

    return NextResponse.json({ content: text }, { headers: cors });
  } catch (err) {
    const apiErr = err as { status?: number; message?: string };
    console.error("[chat] Anthropic SDK error:", apiErr.status, apiErr.message, err);

    if (apiErr.status === 429) {
      return NextResponse.json(
        { error: "The AI service is currently busy. Please wait a moment and try again." },
        { status: 429, headers: cors },
      );
    }
    if (apiErr.status === 401) {
      return NextResponse.json(
        { error: "AI service authentication failed. Check the API key." },
        { status: 502, headers: cors },
      );
    }
    return NextResponse.json(
      { error: `AI service error${apiErr.message ? ": " + apiErr.message : ""}. Please try again.` },
      { status: 502, headers: cors },
    );
  }
}
