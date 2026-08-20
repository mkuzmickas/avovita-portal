import "server-only";

/**
 * QuickBooks Online OAuth 2.0 helpers.
 *
 * Intuit uses a discovery document at
 *   https://developer.api.intuit.com/.well-known/openid_configuration
 * but the endpoints are stable enough to hard-code — we use the
 * production URLs; there is no sandbox toggle here because we only
 * connect against Mike's live company file.
 *
 * Refresh-token lifetime: 100 days from LAST use. We refresh on any
 * request whose access token is within 5 min of expiry, which keeps
 * the refresh token alive indefinitely as long as the nightly cron
 * runs at least once every 100 days.
 */

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

// QBO's production API host (us-east). Sandbox uses a different host but
// we don't use sandbox in this project.
export const QBO_API_HOST = "https://quickbooks.api.intuit.com";

// Minimum scope for reading transactions. Add openid+profile+email if we
// ever want to prove the connecting user's identity, but for now we just
// stamp the admin session's email as connected_by.
const SCOPE = "com.intuit.quickbooks.accounting";

export interface QboOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function readQboConfig(): QboOAuthConfig {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "QuickBooks config missing — set QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET / QUICKBOOKS_REDIRECT_URI in Vercel env vars.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Build the URL to send an admin to for the OAuth consent screen.
 * `state` is opaque round-trip data — we use it as a CSRF nonce that
 * we verify on the callback.
 */
export function buildAuthUrl(state: string): string {
  const cfg = readQboConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPE,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;             // seconds
  x_refresh_token_expires_in: number; // seconds
}

/**
 * Exchange the ?code= from the callback for an access + refresh token.
 * Intuit uses application/x-www-form-urlencoded + Basic auth.
 */
export async function exchangeCodeForToken(code: string): Promise<QboTokenResponse> {
  const cfg = readQboConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  });
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString(
    "base64",
  );
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `QBO token exchange failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return JSON.parse(text) as QboTokenResponse;
}

/**
 * Refresh an existing access token. Intuit may ROTATE the refresh
 * token on this call — always persist whatever comes back.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<QboTokenResponse> {
  const cfg = readQboConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString(
    "base64",
  );
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `QBO refresh failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return JSON.parse(text) as QboTokenResponse;
}

/**
 * Revoke a refresh (or access) token. Called from the admin UI when
 * Mike wants to disconnect the integration.
 */
export async function revokeToken(token: string): Promise<void> {
  const cfg = readQboConfig();
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString(
    "base64",
  );
  await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
}
