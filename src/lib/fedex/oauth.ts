/**
 * FedEx REST API OAuth 2.0 client — client-credentials flow.
 *
 * Tokens are valid for 1 hour and cost a network round-trip to acquire.
 * Cache PER CLIENT ID with a 5-minute safety buffer so we don't spend
 * a token that's about to expire mid-request. We keep separate cache
 * entries because AvoVita now runs two FedEx projects:
 *   - Ship / Rates / Pickup / etc.  → FEDEX_CLIENT_ID
 *   - Tracking only                 → FEDEX_TRACK_CLIENT_ID
 * FedEx enforces per-project rate-limit pools; mixing the two on the
 * same key gets rate-limited in one direction or the other.
 *
 * Sandbox vs production is controlled entirely by FEDEX_API_URL:
 *   - https://apis-sandbox.fedex.com  → test creds work
 *   - https://apis.fedex.com           → production creds required
 *   Mixing them just fails auth — no accidental real shipments.
 */

const tokenCache = new Map<
  string,
  { accessToken: string; expiresAt: number }
>();

const TOKEN_SAFETY_BUFFER_MS = 5 * 60 * 1000;

export interface FedExConfig {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  apiUrl: string;
}

/**
 * The Ship / Rates / Pickup credential set — the original project.
 */
export function readFedExConfig(): FedExConfig {
  const clientId = process.env.FEDEX_CLIENT_ID;
  const clientSecret = process.env.FEDEX_CLIENT_SECRET;
  const accountNumber = process.env.FEDEX_ACCOUNT_NUMBER;
  const apiUrl = process.env.FEDEX_API_URL;
  if (!clientId || !clientSecret || !accountNumber || !apiUrl) {
    throw new Error(
      "FedEx config missing — set FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET / FEDEX_ACCOUNT_NUMBER / FEDEX_API_URL in Vercel env vars.",
    );
  }
  return { clientId, clientSecret, accountNumber, apiUrl };
}

/**
 * The Track-only credential set. Same account number + API URL as the
 * Ship config (both projects sit under one FedEx account), but a
 * different client_id / client_secret so tracking calls burn the
 * track project's rate-limit pool instead of the ship project's.
 * Falls back to the Ship credentials if the Track ones aren't set,
 * so existing deployments keep working until Mike adds the env vars.
 */
export function readFedExTrackConfig(): FedExConfig {
  const base = readFedExConfig();
  const trackClientId = process.env.FEDEX_TRACK_CLIENT_ID;
  const trackClientSecret = process.env.FEDEX_TRACK_CLIENT_SECRET;
  if (!trackClientId || !trackClientSecret) return base;
  return {
    ...base,
    clientId: trackClientId,
    clientSecret: trackClientSecret,
  };
}

/**
 * Returns a valid OAuth access token for the given config. Reuses the
 * per-client-id cached token when it's still comfortably alive;
 * otherwise requests a fresh one.
 */
export async function getFedExAccessToken(
  config: FedExConfig = readFedExConfig(),
): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(config.clientId);
  if (cached && cached.expiresAt - now > TOKEN_SAFETY_BUFFER_MS) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  }).toString();

  const res = await fetch(`${config.apiUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `FedEx OAuth failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number; // seconds
    token_type: string;
    scope: string;
  };

  tokenCache.set(config.clientId, {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  });

  return data.access_token;
}

/**
 * Test-only: wipes the module-level cache so a test can force a
 * fresh token fetch. Prod code should never call this.
 */
export function __resetFedExTokenCache(): void {
  tokenCache.clear();
}
