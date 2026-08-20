import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { exchangeCodeForToken } from "@/lib/quickbooks/oauth";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * GET /api/quickbooks/callback
 *
 * Intuit redirects here with:
 *   ?code=<auth-code>&state=<our-nonce>&realmId=<qbo-company-id>
 *
 * We verify the state matches the cookie we set in /connect, exchange
 * the code for access + refresh tokens, and upsert one row into the
 * integrations table (unique on provider='quickbooks'). Subsequent
 * connects for the same admin overwrite the row — the intent is
 * always "the current QBO connection".
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const errParam = url.searchParams.get("error");

  const financialsUrl = new URL("/admin/financials", request.url);

  if (errParam) {
    financialsUrl.searchParams.set("qbo", `error:${errParam}`);
    return NextResponse.redirect(financialsUrl);
  }
  if (!code || !state || !realmId) {
    financialsUrl.searchParams.set("qbo", "error:missing_params");
    return NextResponse.redirect(financialsUrl);
  }

  // CSRF check
  const cookieState = request.cookies.get("qbo_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    financialsUrl.searchParams.set("qbo", "error:state_mismatch");
    return NextResponse.redirect(financialsUrl);
  }

  // Auth check — connecting requires an admin session
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
    .select("role, email")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role" | "email"> | null };
  if (account?.role !== "admin") {
    return NextResponse.redirect(
      new URL("/portal?msg=admin_required", request.url),
    );
  }

  // Exchange code → tokens
  let tokens;
  try {
    tokens = await exchangeCodeForToken(code);
  } catch (err) {
    console.error("[qbo:callback] token exchange failed:", err);
    financialsUrl.searchParams.set("qbo", "error:token_exchange");
    return NextResponse.redirect(financialsUrl);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const refreshExpiresAt = new Date(
    Date.now() + tokens.x_refresh_token_expires_in * 1000,
  ).toISOString();

  const service = createServiceRoleClient();
  const { error } = await service.from("integrations").upsert(
    {
      provider: "quickbooks",
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
      scope: "com.intuit.quickbooks.accounting",
      connected_by: account.email ?? user.email ?? null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) {
    console.error("[qbo:callback] persist integration failed:", error);
    financialsUrl.searchParams.set("qbo", "error:persist");
    return NextResponse.redirect(financialsUrl);
  }

  // Clear the CSRF cookie and redirect back to financials
  const res = NextResponse.redirect(
    new URL("/admin/financials?qbo=connected", request.url),
  );
  res.cookies.set("qbo_oauth_state", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
