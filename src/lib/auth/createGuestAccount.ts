import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export interface GuestAccountResult {
  /** Supabase auth user id, ready to attach to orders.account_id. */
  accountId: string;
  /** True when this run created the user; false when an existing user was found. */
  created: boolean;
  /**
   * Always null. Retained for back-compat with callers that read this
   * field — magic-link confirmation was removed in favour of the
   * mandatory set-password gate on the checkout success page.
   * @deprecated Field is always null and will be removed in a future
   *   pass once all webhook code paths drop the read.
   */
  confirmationLink: string | null;
  /** True when this account already exists and has a confirmed email. */
  alreadyConfirmed: boolean;
}

/**
 * Idempotent guest account provisioning for the auto-create-on-checkout flow.
 *
 * - If no user exists for `email`: create with a server-generated random
 *   password the customer never sees, mark the email as confirmed
 *   (`email_confirm: true`) — having paid is sufficient proof of email
 *   ownership — and seed an `accounts` profile row. The customer's
 *   real password is set via /api/auth/set-initial-password on the
 *   success page (the mandatory gate there is the only path forward
 *   after checkout).
 * - If a user exists, regardless of confirmation state, return their id.
 *   The set-password gate on the success page will overwrite the
 *   random password with whatever the customer types; if they had a
 *   prior password it gets replaced. (This is acceptable because the
 *   gate runs in-session after a successful Stripe payment that
 *   matches the order's account, so the trust model is the same as
 *   email-link recovery.)
 *
 * Magic links are no longer generated — the cron, send-magic-link, and
 * resend-confirmation endpoints are all stubbed out. Existing
 * unconfirmed customers without a password recover via /forgot-password.
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

    // Existing user — return their id verbatim. We no longer generate
    // magic links; the set-password gate on the success page is the
    // only path through after a checkout, and it works whether the
    // account was confirmed or not (set-initial-password uses the
    // service-role key and bypasses Supabase's confirmation gate).
    return {
      accountId: existing.id,
      created: false,
      confirmationLink: null,
      alreadyConfirmed: !!existing.email_confirmed_at,
    };
  }

  // Brand-new user — random password the customer never sees (the
  // success-page gate replaces it). email_confirm: true because they
  // just paid; that's all the proof of ownership we need, and it lets
  // them sign in immediately after setting their password.
  const tempPassword = randomBytes(24).toString("hex");
  const { data: createdRaw, error: createErr } =
    await service.auth.admin.createUser({
      email: normEmail,
      password: tempPassword,
      email_confirm: true,
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

  return {
    accountId,
    created: true,
    confirmationLink: null,
    alreadyConfirmed: true,
  };
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

