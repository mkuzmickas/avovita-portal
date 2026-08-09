import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";
import {
  buildTestCatalog,
  checkDailyCap,
  checkRateLimit,
  clientIp,
  corsHeadersFor,
  extractSessionMetadata,
  handleOptions,
  parseChatBody,
  recordWidgetChatEvent,
  ALLOWED_ORIGINS,
  RATE_LIMIT_MAX,
} from "@/lib/insights/chat-common";

export const runtime = "nodejs";

/**
 * POST /api/insights/chat — non-streaming JSON response.
 *
 * Kept as the widget's fallback path per the streaming spec: a
 * stream that drops mid-answer or 500s at the edge must have a
 * simpler thing to fall back to. All CORS, rate-limit, and catalog
 * plumbing lives in @/lib/insights/chat-common and is shared with
 * the /api/insights/chat/stream sibling.
 */
export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json(
      { error: origin ? "Origin not allowed" : "Origin header required" },
      { status: 403 },
    );
  }
  const cors = corsHeadersFor(origin);

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

  const ip = clientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded — try again in ${rl.retryAfterSec} second${
          rl.retryAfterSec === 1 ? "" : "s"
        }.`,
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
      },
    );
  }

  const parsed = await parseChatBody(request, cors);
  if (!parsed.ok) return parsed.response;
  const sanitised = parsed.messages;

  // Fire-and-forget: record widget chat traffic in analytics_events so
  // the dashboard can count unique sessions per day + avg messages
  // per session. Portal chat traffic already fires ai_message_sent
  // client-side (via useAnalytics hook), so recordWidgetChatEvent
  // skips portal.avovita.ca origins to avoid double-counting.
  const { session_id, message_index } = extractSessionMetadata(parsed.raw);
  void recordWidgetChatEvent(origin, session_id, message_index);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "[chat] ANTHROPIC_API_KEY is not set — check .env.local and restart the dev server.",
    );
    return NextResponse.json(
      { error: "AI service is not configured. Contact support." },
      { status: 503, headers: cors },
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const catalog = await buildTestCatalog();
    // Prompt caching: mark the system block (SYSTEM_PROMPT + ~10K
    // token catalogue) as ephemeral so Anthropic caches it for 5
    // minutes. Cache hits process substantially faster and cost
    // about a tenth of a normal input read.
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT + catalog,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: sanitised,
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text : null;
    if (!text) {
      console.error(
        "[chat] Unexpected response shape:",
        JSON.stringify(message),
      );
      return NextResponse.json(
        {
          error:
            "Received an unexpected response from the AI. Please try again.",
        },
        { status: 502, headers: cors },
      );
    }

    return NextResponse.json({ content: text }, { headers: cors });
  } catch (err) {
    const apiErr = err as { status?: number; message?: string };
    console.error(
      "[chat] Anthropic SDK error:",
      apiErr.status,
      apiErr.message,
      err,
    );

    if (apiErr.status === 429) {
      return NextResponse.json(
        {
          error:
            "The AI service is currently busy. Please wait a moment and try again.",
        },
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
      {
        error: `AI service error${
          apiErr.message ? ": " + apiErr.message : ""
        }. Please try again.`,
      },
      { status: 502, headers: cors },
    );
  }
}
