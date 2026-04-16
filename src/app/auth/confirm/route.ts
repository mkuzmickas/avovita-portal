import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Supabase email confirmation callback.
 *
 * Supabase sends a link like:
 *   /auth/confirm?token_hash=...&type=signup&next=/portal
 *
 * Critical: we build the Supabase client directly on the redirect
 * response so the session cookies set by verifyOtp are written onto the
 * response the browser actually receives. Using the shared createClient()
 * (which writes to the implicit `cookies()` store) caused the session to
 * be lost — the subsequent NextResponse.redirect() was a separate object
 * that didn't carry those cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/portal";

  // Only allow same-origin redirects to prevent open-redirect attacks.
  const safeNext = next.startsWith("/") ? next : "/portal";

  if (!token_hash || !type) {
    console.warn("[auth/confirm] missing token_hash or type", {
      has_token: !!token_hash,
      type,
    });
    return NextResponse.redirect(`${origin}/auth/link-expired`);
  }

  // 1. Create the redirect response FIRST so cookies are set on it.
  const redirectTo = `${origin}${safeNext}`;
  const response = NextResponse.redirect(redirectTo);

  // 2. Build a Supabase client that reads/writes cookies on this response.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // 3. Exchange the token — session cookies are written onto `response`.
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    console.error("[auth/confirm] verifyOtp failed:", {
      message: error.message,
      type,
    });
    return NextResponse.redirect(`${origin}/auth/link-expired`);
  }

  // 4. Confirm the session is actually established before redirecting.
  //    Retry a few times in case the auth state needs a moment to settle.
  let sessionConfirmed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      sessionConfirmed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!sessionConfirmed) {
    console.error("[auth/confirm] session not established after verifyOtp");
    return NextResponse.redirect(`${origin}/auth/link-expired`);
  }

  console.log("[auth/confirm] verifyOtp ok, session confirmed →", safeNext);
  return response;
}
