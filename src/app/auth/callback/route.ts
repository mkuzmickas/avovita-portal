import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Generic Supabase OAuth / magic-link callback.
 *
 * Supabase hosted auth (OAuth providers, magic link, passwordless) redirects
 * back to `/auth/callback?code=...&next=/portal`. We exchange the code for a
 * session cookie via `exchangeCodeForSession`, then push the user either to
 * the provided `next` path (same-origin only) or `/portal`. On any failure
 * we fall back to `/login?error=confirmation_failed` so the UI can surface
 * a recoverable error message.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/portal";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=confirmation_failed`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error);
    return NextResponse.redirect(
      `${origin}/login?error=confirmation_failed`
    );
  }

  const safeNext = next.startsWith("/") ? next : "/portal";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
