import "server-only";

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { OAuth2Client } from "google-auth-library";

/**
 * GA4 Data API client — OAuth refresh-token auth.
 *
 * AUTH APPROACH
 * -------------
 * Uses a long-lived OAuth refresh token tied to mike@avovita.ca's Google
 * account (which has Editor access to GA4 property 470613793). We do NOT
 * use a service-account JSON key because the AvoVita Google Workspace org
 * policy blocks service-account key creation.
 *
 * The OAuth2 client exchanges the refresh token for short-lived access
 * tokens automatically; we just hand it to BetaAnalyticsDataClient via
 * the `auth` option.
 *
 * REFRESH-TOKEN PROVENANCE
 * ------------------------
 * Generated once via Google's OAuth Playground (developers.google.com/
 * oauthplayground). Required scope:
 *   https://www.googleapis.com/auth/analytics.readonly
 * Steps:
 *   1. In OAuth Playground gear menu, tick "Use your own OAuth credentials"
 *      and paste the GOOGLE_OAUTH_CLIENT_ID + SECRET.
 *   2. Authorise the analytics.readonly scope while signed in as
 *      mike@avovita.ca.
 *   3. Exchange auth code for tokens — keep the refresh_token.
 *   4. Drop the refresh_token into Vercel env var
 *      GOOGLE_OAUTH_REFRESH_TOKEN (production + preview + development).
 *
 * IF THE REFRESH TOKEN EXPIRES OR IS REVOKED
 * ------------------------------------------
 * Refresh tokens last indefinitely unless revoked, the user changes their
 * Google password, or the app is unused for 6+ months. If the dashboard
 * starts returning auth errors:
 *   - Re-run the OAuth Playground steps above.
 *   - Update GOOGLE_OAUTH_REFRESH_TOKEN in Vercel for all three envs.
 *   - Redeploy.
 *
 * QUOTA
 * -----
 * GA4 Data API quota is 200K core-tokens/property/day; runReport costs
 * 10–100 tokens depending on complexity. With our 15-minute server-side
 * cache the dashboard uses far below 1K tokens/day.
 */

let client: BetaAnalyticsDataClient | null = null;

export function getGA4Client(): BetaAnalyticsDataClient {
  if (client) return client;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GA4 client not configured — missing GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN env vars",
    );
  }

  const authClient = new OAuth2Client(clientId, clientSecret);
  authClient.setCredentials({ refresh_token: refreshToken });

  // google-gax's ClientOptions expects an AuthClient under `authClient`;
  // OAuth2Client is one. Cast keeps us typed without dragging the auth-library
  // generics into the call site.
  client = new BetaAnalyticsDataClient({
    authClient: authClient as unknown as NonNullable<
      ConstructorParameters<typeof BetaAnalyticsDataClient>[0]
    >["authClient"],
  });

  return client;
}

export function getGA4PropertyId(): string {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) {
    throw new Error("GA4_PROPERTY_ID env var is not set");
  }
  return id;
}

/** Test-only: clear the cached singleton between unit tests. */
export function __resetGA4ClientForTests(): void {
  client = null;
}
