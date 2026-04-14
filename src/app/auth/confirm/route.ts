import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Supabase email confirmation callback.
 *
 * Supabase sends a link like:
 *   /auth/confirm?token_hash=...&type=signup&next=/portal
 * when a new user confirms their email, resets their password, or accepts
 * an invite. We exchange the token_hash for a session via `verifyOtp`,
 * then redirect them either to the `next` path or `/portal` on success,
 * or to `/login?error=confirmation_failed` on any failure.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/portal";

  if (!token_hash || !type) {
    console.warn("[auth/confirm] missing token_hash or type", {
      has_token: !!token_hash,
      type,
    });
    return NextResponse.redirect(`${origin}/auth/link-expired`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    console.error("[auth/confirm] verifyOtp failed:", {
      message: error.message,
      type,
    });
    return NextResponse.redirect(`${origin}/auth/link-expired`);
  }
  console.log("[auth/confirm] verifyOtp ok →", next);

  // Only allow same-origin redirects for `next` to prevent open-redirect
  // attacks — anything that doesn't start with "/" falls back to /portal.
  const safeNext = next.startsWith("/") ? next : "/portal";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
