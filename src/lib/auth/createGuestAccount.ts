import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

const PORTAL_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
  "https://portal.avovita.ca";

export interface GuestAccountResult {
  /** Supabase auth user id, ready to attach to orders.account_id. */
  accountId: string;
  /** True when this run created the user; false when an existing user was found. */
  created: boolean;
  /**
   * Confirmation link for the email-not-yet-confirmed case. Null when the
   * user already has a confirmed email (no action needed).
   */
  confirmationLink: string | null;
  /** True when this account already exists and has a confirmed email. */
  alreadyConfirmed: boolean;
}

/**
 * Idempotent guest account provisioning for the auto-create-on-checkout flow.
 *
 * - If no user exists for `email`: create with a server-generated random
 *   password (`email_confirm: false`) and seed an `accounts` profile row.
 *   Return a fresh confirmation link for inclusion in the order email.
 * - If a user exists but is unconfirmed: regenerate the confirmation link.
 * - If a user exists and is confirmed: return their id and signal that no
 *   further action is needed (caller can simply attach the order and prompt
 *   sign-in to track it).
 *
 * The random password is intentionally never exposed — users activate via
 * the confirmation link and set a password through the optional /portal
 * prompt later.
 */
export interface GuestAccountOptions {
  /** White-label org the account was created via. Tagged on accounts.org_id. */
  orgId?: string | null;
  /** Set true when this is a caregiver / POA creating an account to order
   *  on behalf of dependent clients. */
  isRepresentative?: boolean;
  /** Rep's mobile number — stored on accounts.phone so SMS notifications
   *  reach them (dependent profiles have no phone of their own). */
  phone?: string | null;
}

export async function createOrFindGuestAccount(
  email: string,
  options: GuestAccountOptions = {}
): Promise<GuestAccountResult> {
  const normEmail = email.trim().toLowerCase();
  if (!normEmail) {
    throw new Error("Email is required for guest account provisioning");
  }

  const service = createServiceRoleClient();
  const orgId = options.orgId ?? null;
  const isRepresentative = options.isRepresentative === true;
  const phone = options.phone?.trim() || null;

  // Try to find an existing auth user for this email
  const existing = await findUserByEmail(normEmail);

  if (existing) {
    // If the existing account has no org tag yet but this checkout has
    // one, backfill — first-touch wins. Don't overwrite an already-set
    // org (avoids one partner clobbering another's attribution).
    // Same logic for is_representative + phone — never downgrade a
    // representative to a regular account, and don't overwrite a phone
    // the user might have set themselves later.
    if (orgId || isRepresentative || phone) {
      try {
        const { data: existingAcc } = await service
          .from("accounts")
          .select("org_id, is_representative, phone")
          .eq("id", existing.id)
          .maybeSingle();
        const current = existingAcc as {
          org_id: string | null;
          is_representative: boolean | null;
          phone: string | null;
        } | null;
        const patch: Record<string, unknown> = {};
        if (orgId && !current?.org_id) patch.org_id = orgId;
        if (isRepresentative && !current?.is_representative) {
          patch.is_representative = true;
        }
        if (phone && !current?.phone) patch.phone = phone;
        if (Object.keys(patch).length > 0) {
          await service
            .from("accounts")
            .update(patch)
            .eq("id", existing.id);
        }
      } catch (err) {
        console.warn(
          "[createGuestAccount] backfill failed (non-fatal):",
          err
        );
      }
    }

    if (existing.email_confirmed_at) {
      return {
        accountId: existing.id,
        created: false,
        confirmationLink: null,
        alreadyConfirmed: true,
      };
    }
    // Unconfirmed — regenerate a fresh link they can use from the new email
    const link = await generateConfirmationLink(normEmail);
    return {
      accountId: existing.id,
      created: false,
      confirmationLink: link,
      alreadyConfirmed: false,
    };
  }

  // Brand-new user — random password they never see, no auto email
  const tempPassword = randomBytes(24).toString("hex");
  const { data: createdRaw, error: createErr } =
    await service.auth.admin.createUser({
      email: normEmail,
      password: tempPassword,
      email_confirm: false,
    });

  if (createErr || !createdRaw?.user) {
    throw new Error(
      `Failed to create guest account: ${createErr?.message ?? "unknown"}`
    );
  }
  const accountId = createdRaw.user.id;

  // Seed the profile row in the `accounts` table so RLS-protected reads
  // by other parts of the app find a record. The DB trigger that mirrors
  // auth.users may already do this — we upsert to be safe.
  await service
    .from("accounts")
    .upsert(
      {
        id: accountId,
        email: normEmail,
        phone,
        role: "patient",
        waiver_completed: false,
        org_id: orgId,
        is_representative: isRepresentative,
      },
      { onConflict: "id" }
    );

  const link = await generateConfirmationLink(normEmail);

  return {
    accountId,
    created: true,
    confirmationLink: link,
    alreadyConfirmed: false,
  };
}

/**
 * Standalone helper for the cron job — regenerates a confirmation link for
 * an existing unconfirmed user.
 */
export async function regenerateConfirmationLink(
  email: string
): Promise<string> {
  return generateConfirmationLink(email.trim().toLowerCase());
}

// ─── Internal helpers ────────────────────────────────────────────────

async function findUserByEmail(
  email: string
): Promise<{ id: string; email_confirmed_at: string | null } | null> {
  const service = createServiceRoleClient();

  // Direct query on the public.accounts mirror table (indexed on email
  // via the unique constraint Supabase adds for auth.users sync). This
  // is O(1) regardless of total user count and avoids the list-and-scan
  // pagination of auth.admin.listUsers.
  const { data: accountRow, error: queryErr } = await service
    .from("accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (queryErr) {
    throw new Error(`accounts lookup failed: ${queryErr.message}`);
  }
  const account = accountRow as { id: string } | null;
  if (!account) return null;

  // Need email_confirmed_at from auth.users for the confirmed branch —
  // pull it via admin.getUserById, which is a single direct call by id.
  const { data, error } = await service.auth.admin.getUserById(account.id);
  if (error || !data?.user) {
    // Account row exists but auth.user doesn't (data drift). Treat as
    // not-found so the caller falls through to create a fresh user.
    console.warn(
      `[createGuestAccount] accounts row for ${email} has no auth.user — recreating`
    );
    return null;
  }
  return {
    id: data.user.id,
    email_confirmed_at: data.user.email_confirmed_at ?? null,
  };
}

/**
 * Generates an action link the user can click to (a) confirm their email and
 * (b) be signed straight into the portal.
 *
 * Important: we DON'T return Supabase's default `action_link` because that
 * URL goes to Supabase's verify endpoint and redirects with auth tokens in
 * the URL HASH. Hash tokens are only readable by client JS — by the time
 * the browser sets the session, the server-rendered /portal middleware has
 * already redirected to /login because cookies aren't set yet.
 *
 * Instead we build our own URL pointing at /auth/confirm with the
 * `hashed_token` parameter. Our route runs `verifyOtp` server-side, which
 * writes the auth cookies, THEN issues the redirect to /portal — so the
 * middleware sees a valid session on arrival. No client-side race.
 */
async function generateConfirmationLink(email: string): Promise<string> {
  const service = createServiceRoleClient();
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${PORTAL_URL}/portal`,
    },
  });
  const props = data?.properties as
    | {
        action_link?: string;
        hashed_token?: string;
      }
    | undefined;
  if (error || !props?.hashed_token) {
    throw new Error(
      `auth.admin.generateLink failed: ${error?.message ?? "no hashed_token"}`
    );
  }
  const params = new URLSearchParams({
    token_hash: props.hashed_token,
    type: "magiclink",
    next: "/portal",
  });
  return `${PORTAL_URL}/auth/confirm?${params.toString()}`;
}
