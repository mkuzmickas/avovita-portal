import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Resolves once `promise` settles or after `ms` milliseconds, whichever
 * comes first. Used to defend against Supabase client calls that hang
 * indefinitely on stale serverless connections — try/catch alone doesn't
 * help because a hung await never throws.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T | { __timeout: true }> {
  return Promise.race<T | { __timeout: true }>([
    promise.then((v) => v as T),
    new Promise<{ __timeout: true }>((resolve) =>
      setTimeout(() => {
        console.warn(`[complete-waiver] ${label} timed out after ${ms}ms`);
        resolve({ __timeout: true });
      }, ms)
    ),
  ]);
}

function isTimeoutResult<T>(
  v: T | { __timeout: true }
): v is { __timeout: true } {
  return (
    typeof v === "object" &&
    v !== null &&
    "__timeout" in (v as Record<string, unknown>) &&
    (v as { __timeout: true }).__timeout === true
  );
}

/**
 * POST /api/auth/complete-waiver
 *
 * Records the client's waiver signature on their accounts row and
 * inserts a general_pipa consent row. Called from the WaiverForm
 * component (used in both the post-purchase onboarding flow and the
 * standalone /portal/complete-waiver page).
 *
 * Hardening notes:
 *   - Auth lookup uses cookie-bound supabase client AND a hard timeout
 *     because supabase.auth.getUser() can stall on a freshly-issued
 *     session cookie (typical right after a magic-link confirmation).
 *   - Accounts UPDATE goes through the service-role client to avoid the
 *     cookie/RLS code path entirely. We've already verified the user id
 *     above, so writing as service-role is safe.
 *   - Consents INSERT is best-effort with its own short timeout.
 *   - Every checkpoint logs a labelled timing so a hang shows up in
 *     server logs as "got past X, stuck before Y".
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const log = (label: string) =>
    console.log(`[complete-waiver] +${Date.now() - t0}ms — ${label}`);

  try {
    log("handler entered");

    const supabaseUser = await createClient();
    log("client created");

    const userResult = await withTimeout(
      supabaseUser.auth.getUser(),
      5000,
      "auth.getUser"
    );
    if (isTimeoutResult(userResult)) {
      console.error("[complete-waiver] auth.getUser hung — aborting");
      return NextResponse.json(
        { error: "Auth check timed out — please refresh and try again" },
        { status: 504 }
      );
    }
    const user = userResult.data.user;
    if (!user) {
      log("no user → 401");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    log(`user resolved: ${user.id}`);

    const body = await request.json();
    const signedName: string | undefined = body.signed_name;
    if (!signedName || signedName.trim().length < 3) {
      log("invalid signed_name → 400");
      return NextResponse.json(
        { error: "A signed name of at least 3 characters is required" },
        { status: 400 }
      );
    }
    log("body parsed + validated");

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    const nowIso = new Date().toISOString();

    // ─── PRIMARY WRITE: accounts ────────────────────────────────────
    // Service-role bypasses RLS and the cookie-bound auth path that has
    // been the source of the intermittent hang. We've already verified
    // user.id above, so this is safe.
    const service = createServiceRoleClient();
    log("service client created");

    // ─── PRIMARY WRITE: accounts (with one retry) ───────────────────
    // Service-role bypasses RLS. Run with a 15s timeout and one retry
    // after a short backoff so a transient connection blip doesn't
    // surface as a user-facing error.
    const runAccountsUpdate = () =>
      withTimeout(
        Promise.resolve(
          service
            .from("accounts")
            .update({
              waiver_completed: true,
              waiver_completed_at: nowIso,
              waiver_ip_address: ipAddress,
              waiver_signed_name: signedName.trim(),
              waiver_version: "1.0",
            })
            .eq("id", user.id)
        ),
        15_000,
        "accounts.update"
      );

    let updateResult = await runAccountsUpdate();
    if (isTimeoutResult(updateResult)) {
      log("accounts.update first attempt timed out — retrying once");
      await new Promise((r) => setTimeout(r, 1000));
      updateResult = await runAccountsUpdate();
    }
    if (isTimeoutResult(updateResult)) {
      console.error(
        "[complete-waiver] accounts.update timed out twice — aborting"
      );
      return NextResponse.json(
        { error: "Save timed out — please refresh and try again" },
        { status: 504 }
      );
    }
    if (updateResult.error) {
      log(`accounts.update error: ${updateResult.error.message}`);
      return NextResponse.json(
        { error: `Failed to save waiver: ${updateResult.error.message}` },
        { status: 500 }
      );
    }
    log("accounts.update succeeded");

    // ─── BEST-EFFORT: consent log (sequential, isolated) ────────────
    // Runs AFTER the accounts.update has succeeded so a failure here
    // can never cascade into a failed waiver save. Wrapped in its own
    // try/catch so any error is swallowed and logged only.
    try {
      const consentResult = await withTimeout(
        Promise.resolve(
          service.from("consents").insert({
            account_id: user.id,
            profile_id: null,
            consent_type: "general_pipa",
            consent_text_version: "1.0",
            ip_address: ipAddress,
            user_agent: request.headers.get("user-agent") ?? null,
          })
        ),
        15_000,
        "consent insert"
      );
      if (isTimeoutResult(consentResult)) {
        log("consent insert timed out — non-fatal, waiver already saved");
      } else if (consentResult.error) {
        log(`consent insert error (non-fatal): ${consentResult.error.message}`);
      } else {
        log("consent insert succeeded");
      }
    } catch (consentErr) {
      console.error(
        "[complete-waiver] consent log insert threw (non-fatal):",
        consentErr
      );
    }

    log("returning success");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[complete-waiver] handler error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
