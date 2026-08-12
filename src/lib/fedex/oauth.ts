/**
 * FedEx REST API OAuth 2.0 client — client-credentials flow.
 *
 * FedEx tokens are valid for 1 hour and cost a network round-trip to
 * acquire. Cache in module scope with a 5-minute safety buffer so we
 * don't spend a token that's about to expire mid-request.
 *
 * Reads FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET / FEDEX_API_URL from
 * process.env. Any missing var throws — callers should check
 * config presence before calling this.
 *
 * Sandbox vs production is controlled entirely by FEDEX_API_URL:
 *   - https://apis-sandbox.fedex.com  → test creds work
 *   - https://apis.fedex.com           → production creds required
 *   Mixing them just fails auth — no accidental real shipments.
 */

let cachedToken: {
  accessToken: string;
  expiresAt: number; // ms epoch
} | null = null;

const TOKEN_SAFETY_BUFFER_MS = 5 * 60 * 1000;

export interface FedExConfig {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  apiUrl: string;
}

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
 * Returns a valid OAuth access token. Reuses the cached token when
 * it's still comfortably alive; otherwise requests a fresh one.
 */
export async function getFedExAccessToken(
  config: FedExConfig = readFedExConfig(),
): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > TOKEN_SAFETY_BUFFER_MS) {
    return cachedToken.accessToken;
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

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * Test-only: wipes the module-level cache so a test can force a
 * fresh token fetch. Prod code should never call this.
 */
export function __resetFedExTokenCache(): void {
  cachedToken = null;
}
