import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/quickbooks/oauth";
import { randomBytes } from "crypto";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * GET /api/quickbooks/connect
 *
 * Admin-only. Generates a CSRF nonce, stores it in a short-lived
 * HttpOnly cookie, and redirects to Intuit's OAuth consent screen.
 * Intuit will send the user to /api/quickbooks/callback with a code
 * and the same state value, which we verify against the cookie.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login?redirectTo=/admin/financials", request.url),
    );
  }
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") {
    return NextResponse.redirect(new URL("/portal?msg=admin_required", request.url));
  }

  const state = randomBytes(24).toString("hex");
  const authUrl = buildAuthUrl(state);
  const res = NextResponse.redirect(authUrl);
  // 10-min nonce cookie; HttpOnly so JS can't read it.
  res.cookies.set("qbo_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
