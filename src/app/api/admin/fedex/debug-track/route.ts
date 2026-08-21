import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/fedex/debug-track
 *
 * Diagnostic endpoint for the FedEx Track credential chain. Reveals:
 *   1. Which env vars are actually populated in this deploy (masked)
 *   2. Whether the OAuth handshake against production succeeds
 *   3. Whether a real /track call against a dummy tracking number
 *      returns a Track-scoped response or a scope error
 *
 * Values are masked to first-4 / last-4 chars so we can tell "X was
 * pasted" from "X is empty" without leaking the credential.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const mask = (s: string | undefined | null) => {
    if (!s) return { present: false, length: 0, preview: "(empty)" };
    return {
      present: true,
      length: s.length,
      preview: `${s.slice(0, 4)}…${s.slice(-4)}`,
    };
  };

  const shipId = process.env.FEDEX_CLIENT_ID;
  const shipSecret = process.env.FEDEX_CLIENT_SECRET;
  const trackId = process.env.FEDEX_TRACK_CLIENT_ID;
  const trackSecret = process.env.FEDEX_TRACK_CLIENT_SECRET;
  const apiUrl = process.env.FEDEX_API_URL;

  const usingTrackCreds = Boolean(trackId && trackSecret);
  const effectiveClientId = usingTrackCreds ? trackId! : shipId!;
  const effectiveClientSecret = usingTrackCreds ? trackSecret! : shipSecret!;

  const envSnapshot = {
    FEDEX_API_URL: apiUrl ?? "(missing)",
    FEDEX_CLIENT_ID: mask(shipId),
    FEDEX_CLIENT_SECRET: mask(shipSecret),
    FEDEX_TRACK_CLIENT_ID: mask(trackId),
    FEDEX_TRACK_CLIENT_SECRET: mask(trackSecret),
    routing_to: usingTrackCreds
      ? "Track project (FEDEX_TRACK_*)"
      : "Ship project (FEDEX_* fallback — Track env vars missing or empty)",
    effective_client_id_used: mask(effectiveClientId),
  };

  if (!apiUrl || !effectiveClientId || !effectiveClientSecret) {
    return NextResponse.json({
      step: "env",
      ok: false,
      envSnapshot,
      note: "One or more required env vars are missing. Add them in Vercel and redeploy.",
    });
  }

  // ─── Step 1: OAuth handshake ────────────────────────────────────
  let accessToken: string | null = null;
  let oauthResult: {
    status: number;
    ok: boolean;
    scope: string | null;
    body: string;
  };
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: effectiveClientId,
      client_secret: effectiveClientSecret,
    }).toString();
    const res = await fetch(`${apiUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const raw = await res.text();
    let parsed: { access_token?: string; scope?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* keep raw */
    }
    accessToken = parsed.access_token ?? null;
    oauthResult = {
      status: res.status,
      ok: res.ok,
      scope: parsed.scope ?? null,
      body: raw.slice(0, 500),
    };
  } catch (err) {
    return NextResponse.json({
      step: "oauth",
      ok: false,
      envSnapshot,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!accessToken) {
    return NextResponse.json({
      step: "oauth",
      ok: false,
      envSnapshot,
      oauthResult,
      note: "OAuth handshake returned no access_token. Check env var values match the FedEx Production tab exactly (no trailing whitespace).",
    });
  }

  // ─── Step 2: actual /track call to confirm scope ────────────────
  let trackResult: { status: number; ok: boolean; body: string };
  try {
    const body = {
      trackingInfo: [
        // Dummy tracking number — FedEx will still validate scope on
        // the call even if the number itself is bogus (returns a
        // 200 with an error inside on scope-ok, 403 on scope-miss).
        { trackingNumberInfo: { trackingNumber: "111111111111" } },
      ],
      includeDetailedScans: false,
    };
    const res = await fetch(`${apiUrl}/track/v1/trackingnumbers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-locale": "en_US",
      },
      body: JSON.stringify(body),
    });
    trackResult = {
      status: res.status,
      ok: res.ok,
      body: (await res.text()).slice(0, 1000),
    };
  } catch (err) {
    return NextResponse.json({
      step: "track",
      ok: false,
      envSnapshot,
      oauthResult,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    step: "track",
    ok: trackResult.ok,
    envSnapshot,
    oauthResult,
    trackResult,
    diagnosis: !trackResult.ok
      ? trackResult.status === 403
        ? "Credentials authenticated but Track API scope is missing. Either these are Sandbox keys (production URL rejects them), or the Track/Basic Integrated Visibility API isn't attached to the Production key for this project."
        : `HTTP ${trackResult.status} from /track/v1/trackingnumbers.`
      : "Track call reached FedEx successfully — check response body for per-tracking-number results.",
  });
}
