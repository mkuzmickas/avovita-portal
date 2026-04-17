import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ─── Per-IP rate limiting ───────────────────��──────────────────────
// In-memory sliding window: 20 requests per hour per IP. Matches the
// free-download endpoint pattern. Protects against token brute-force.
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
 * GET /api/resources/purchased/download/[token]
 *
 * Secured download for paid resources. The token IS the auth — no
 * login required. Validates expiry and download count, generates a
 * 60-second signed URL from Supabase Storage, increments counters,
 * and returns a 302 redirect.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Rate limit
  const ip = clientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return new NextResponse("Too many requests. Please try again later.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  const supabase = createServiceRoleClient();

  // 1. Look up purchase by download_token
  const { data: purchaseRaw, error: purchaseErr } = await supabase
    .from("resource_purchases")
    .select(
      "id, resource_id, download_count, max_downloads, expires_at",
    )
    .eq("download_token", token)
    .single();

  if (purchaseErr || !purchaseRaw) {
    return new NextResponse("Invalid or expired download link.", {
      status: 404,
    });
  }

  const purchase = purchaseRaw as {
    id: string;
    resource_id: string;
    download_count: number;
    max_downloads: number;
    expires_at: string;
  };

  // 2. Check expiry
  if (new Date(purchase.expires_at) < new Date()) {
    return new NextResponse(
      "This download link has expired. Please contact support@avovita.ca for assistance.",
      { status: 410 },
    );
  }

  // 3. Check download count
  if (purchase.download_count >= purchase.max_downloads) {
    return new NextResponse(
      "This download has reached its maximum number of uses. Please contact support@avovita.ca if you need help.",
      { status: 429 },
    );
  }

  // 4. Fetch resource to get file_path
  const { data: resRaw, error: resErr } = await supabase
    .from("resources")
    .select("file_path")
    .eq("id", purchase.resource_id)
    .single();

  if (resErr || !resRaw) {
    return new NextResponse("Resource not found.", { status: 404 });
  }

  const resource = resRaw as { file_path: string };

  // 5. Atomic increment via RPC — row-locked, enforces max_downloads
  //    AND expiry at the DB level. This MUST run before generating
  //    the signed URL so that parallel requests are serialized.
  const { data: rpcResult, error: rpcErr } = await supabase.rpc(
    "increment_resource_purchase_download",
    { p_purchase_id: purchase.id },
  );

  if (rpcErr) {
    console.error(
      "[purchased-download] RPC increment failed:",
      rpcErr,
    );
    return new NextResponse("Failed to process download.", {
      status: 500,
    });
  }

  const rpc = rpcResult as {
    success: boolean;
    new_download_count: number;
    max_downloads: number;
  } | null;

  if (!rpc?.success) {
    // Another concurrent request consumed the last allowed download,
    // or the link expired between the pre-check and the RPC call.
    return new NextResponse(
      "This download has reached its maximum number of uses. Please contact support@avovita.ca if you need help.",
      { status: 429 },
    );
  }

  // 6. Generate signed URL (60 seconds) — only if RPC succeeded
  const { data: signedData, error: signErr } = await supabase.storage
    .from("resources")
    .createSignedUrl(resource.file_path, 60);

  if (signErr || !signedData?.signedUrl) {
    console.error(
      "[purchased-download] Signed URL generation failed:",
      signErr,
    );
    return new NextResponse("Failed to generate download link.", {
      status: 500,
    });
  }

  // 7. Analytics counter — fire-and-forget (non-blocking)
  Promise.resolve(
    supabase.rpc("increment_resource_download_count", {
      p_resource_id: purchase.resource_id,
    }),
  ).catch((err: unknown) => {
    console.error(
      "[purchased-download] Analytics increment failed (non-fatal):",
      err,
    );
  });

  // 8. Redirect to signed URL
  return NextResponse.redirect(signedData.signedUrl);
}
