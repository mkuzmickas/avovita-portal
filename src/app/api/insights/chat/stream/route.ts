import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";
import {
  ALLOWED_ORIGINS,
  RATE_LIMIT_MAX,
  buildTestCatalog,
  checkDailyCap,
  checkRateLimit,
  clientIp,
  corsHeadersFor,
  handleOptions,
  parseChatBody,
} from "@/lib/insights/chat-common";

export const runtime = "nodejs";

/**
 * POST /api/insights/chat/stream — Server-Sent Events response.
 *
 * Same request contract as /api/insights/chat but tokens flow to the
 * client as they arrive from Anthropic. Total generation time barely
 * changes but perceived latency drops from 8-10 seconds of silence to
 * about a second, because words start appearing at reading speed
 * instead of arriving in one final block.
 *
 * Frame format (each frame terminated by \n\n):
 *   data: {"type":"chunk","text":"Hello"}\n\n
 *   data: {"type":"chunk","text":" world"}\n\n
 *   data: {"type":"done"}\n\n
 *
 * Errors that happen mid-stream are surfaced in-band so the widget
 * can render an explanation instead of silently presenting a half-
 * answer:
 *   data: {"type":"error","message":"..."}\n\n
 *   data: {"type":"done"}\n\n
 *
 * Pre-stream errors (bad origin, rate limit, missing key) go out as
 * ordinary JSON responses with the appropriate HTTP status — same
 * shape as the non-streaming route so the widget's error handling
 * doesn't have to fork by transport.
 *
 * The non-streaming /api/insights/chat route stays live as the
 * fallback the widget will fail over to if a stream drops.
 */

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

// Widget's markdown-into-cards parser buffers by line, so a chunked
// stream where each frame carries at least one whole word is easier
// to render than a byte-at-a-time stream. Anthropic's SDK emits at
// natural token boundaries, so no extra buffering needed on our side.
function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "[chat-stream] ANTHROPIC_API_KEY is not set — check .env.local and restart the dev server.",
    );
    return NextResponse.json(
      { error: "AI service is not configured. Contact support." },
      { status: 503, headers: cors },
    );
  }

  const client = new Anthropic({ apiKey });
  const catalog = await buildTestCatalog();

  // Stream headers. X-Accel-Buffering: no is a Vercel/Nginx hint to
  // disable proxy buffering — without it, some layers hold small
  // chunks until a bigger block accumulates, defeating the perceived-
  // latency win. Content-Type is text/event-stream so browsers know
  // to hand the body to EventSource / fetch reader without decoding.
  const streamHeaders: Record<string, string> = {
    ...cors,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(payload)));
        } catch {
          // Controller may be closed if the client disconnected
          // between frames — nothing to do.
        }
      };

      try {
        // Prompt caching identical to the non-streaming route. Cached
        // input is processed substantially faster, which stacks with
        // streaming to bring time-to-first-token under the 1.5s
        // acceptance target.
        const stream = client.messages.stream({
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

        stream.on("text", (delta: string) => {
          if (delta.length > 0) send({ type: "chunk", text: delta });
        });

        // Wait for the SDK to finalise so an error thrown at the tail
        // (e.g. content-filter refusal, quota) still surfaces before
        // we send the terminal 'done' frame.
        await stream.finalMessage();
        send({ type: "done" });
      } catch (err) {
        const apiErr = err as { status?: number; message?: string };
        console.error(
          "[chat-stream] Anthropic SDK error:",
          apiErr.status,
          apiErr.message,
          err,
        );
        const message =
          apiErr.status === 429
            ? "The AI service is currently busy. Please wait a moment and try again."
            : apiErr.status === 401
              ? "AI service authentication failed."
              : `AI service error${apiErr.message ? ": " + apiErr.message : ""}. Please try again.`;
        send({ type: "error", message });
        send({ type: "done" });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed — nothing to do.
        }
      }
    },
    cancel() {
      // Client disconnected. Anthropic stream will surface an abort
      // on its own event loop; we don't need to explicitly abort
      // because the request is already in flight and the response
      // body is nowhere to go.
    },
  });

  return new Response(body, { headers: streamHeaders });
}
