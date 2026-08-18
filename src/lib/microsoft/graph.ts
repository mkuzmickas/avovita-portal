import "server-only";

/**
 * Microsoft Graph OAuth 2.0 client — client-credentials flow.
 *
 * Reads MS_GRAPH_TENANT_ID / _CLIENT_ID / _CLIENT_SECRET / _MAILBOX
 * from env. Any missing var throws with a clear message so the cron
 * caller can surface a config-missing state to admins.
 *
 * Tokens are cached in module scope with a 5-min safety buffer so
 * back-to-back Graph calls in the same cron tick share one token.
 * Vercel cold starts wipe the cache — that's fine, we refetch.
 *
 * Application-permission mode: portal acts as an app, not on behalf
 * of Mike. Requires admin consent for Mail.Read + Mail.ReadWrite on
 * the tenant and an Application Access Policy that restricts the app
 * to only the mailbox we care about (MS_GRAPH_MAILBOX).
 */

let cachedToken: { accessToken: string; expiresAt: number } | null = null;
const SAFETY_BUFFER_MS = 5 * 60 * 1000;

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
}

export function readGraphConfig(): GraphConfig {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const mailbox = process.env.MS_GRAPH_MAILBOX;
  if (!tenantId || !clientId || !clientSecret || !mailbox) {
    throw new Error(
      "Microsoft Graph config missing — set MS_GRAPH_TENANT_ID / _CLIENT_ID / _CLIENT_SECRET / _MAILBOX in Vercel env vars.",
    );
  }
  return { tenantId, clientId, clientSecret, mailbox };
}

export async function getGraphAccessToken(
  config: GraphConfig = readGraphConfig(),
): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > SAFETY_BUFFER_MS) {
    return cachedToken.accessToken;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  }).toString();

  const res = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Microsoft Graph OAuth failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

export function graphMailboxUrl(config: GraphConfig, path: string): string {
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}${path}`;
}

/**
 * Wraps Graph API requests with auth + JSON handling. Callers pass a
 * relative path starting with '/messages' etc.; the mailbox segment
 * is injected automatically.
 */
export async function graphFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = readGraphConfig();
  const token = await getGraphAccessToken(config);
  const url = graphMailboxUrl(config, path);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Microsoft Graph ${init.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  // DELETE / PATCH may return 204 No Content — allow empty body.
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
