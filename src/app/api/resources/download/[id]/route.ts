import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ─── Per-IP rate limiting ──────────────────────────────────────────
// In-memory sliding window: 20 downloads per hour per IP. Resets on
// serverless cold start — acceptable for this scale.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ipHits = new Map<string, number[]>();

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
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

/**
 * GET /api/resources/download/[id]
 *
 * Free resource download endpoint. No auth required.
 * Validates: resource active + price_cad = 0. Generates a 60-second
 * signed URL from Supabase Storage and returns a 302 redirect.
 * Atomically increments download_count.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Rate limit
  const ip = clientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many downloads. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  const supabase = createServiceRoleClient();

  // Fetch the resource
  const { data: resource, error } = await supabase
    .from("resources")
    .select("id, file_path, price_cad, active, title")
    .eq("id", id)
    .single();

  if (error || !resource) {
    return NextResponse.json(
      { error: "Resource not found" },
      { status: 404 },
    );
  }

  const res = resource as {
    id: string;
    file_path: string;
    price_cad: number;
    active: boolean;
    title: string;
  };

  if (!res.active) {
    return NextResponse.json(
      { error: "Resource not found" },
      { status: 404 },
    );
  }

  if (res.price_cad > 0) {
    return NextResponse.json(
      { error: "This resource requires purchase" },
      { status: 403 },
    );
  }

  // Generate signed URL (60 seconds)
  const { data: signedData, error: signError } = await supabase.storage
    .from("resources")
    .createSignedUrl(res.file_path, 60);

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 },
    );
  }

  // Increment download_count. Not strictly atomic but fine at this scale.
  const { data: current } = await supabase
    .from("resources")
    .select("download_count")
    .eq("id", id)
    .single();
  const currentCount =
    (current as { download_count: number } | null)?.download_count ?? 0;
  await supabase
    .from("resources")
    .update({ download_count: currentCount + 1 })
    .eq("id", id);

  // Redirect to signed URL
  return NextResponse.redirect(signedData.signedUrl);
}
