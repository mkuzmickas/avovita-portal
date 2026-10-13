import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-start
 *
 * Interstitial handler for the inbox-prefetch-safe password reset
 * flow. Receives the base64url-encoded Supabase recovery URL in `rt`,
 * verifies it's actually a Supabase verify URL (so an attacker can't
 * submit this form with a different `rt` and have us 302 them to an
 * arbitrary site), then issues a 302 to Supabase. The user's browser
 * follows the redirect, Supabase consumes the recovery token for the
 * first time, and the user lands on /auth/update-password with a
 * live session.
 *
 * Only POST — GET would re-expose the Supabase URL to inbox
 * prefetchers via the query string if they followed the redirect
 * chain, defeating the whole point.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const rt = form.get("rt");
  if (typeof rt !== "string" || rt.length === 0) {
    return NextResponse.redirect(
      new URL("/forgot-password?reason=missing_token", request.url),
      302,
    );
  }

  let decoded: string;
  try {
    decoded = Buffer.from(rt, "base64url").toString("utf8");
  } catch {
    return NextResponse.redirect(
      new URL("/forgot-password?reason=invalid_token", request.url),
      302,
    );
  }

  // Trust fence: only redirect to the Supabase project this app is
  // bound to. Anything else and we send the user to the forgot-
  // password page instead. The project ref comes from the public
  // Supabase URL env var that's already live in the browser bundle,
  // so there's no secret handling here.
  const supabaseBase =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const allowedPrefix = `${supabaseBase}/auth/v1/`;
  let target: URL;
  try {
    target = new URL(decoded);
  } catch {
    return NextResponse.redirect(
      new URL("/forgot-password?reason=invalid_url", request.url),
      302,
    );
  }
  if (!decoded.startsWith(allowedPrefix)) {
    return NextResponse.redirect(
      new URL("/forgot-password?reason=untrusted_target", request.url),
      302,
    );
  }

  return NextResponse.redirect(target, 302);
}
