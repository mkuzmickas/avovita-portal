import "server-only";
import { stripe } from "@/lib/stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the Stripe Customer ID for an AvoVita account, creating
 * one lazily on first call.
 *
 * Order of preference for the customer's display fields:
 *   • Email — from accounts.email
 *   • Name — "{first_name} {last_name}" from the account's primary
 *     patient_profile when available; falls back to the email
 *   • Phone — from the primary profile if present
 *
 * Race-safe: if two admin clicks land at the same instant and both
 * create a Stripe Customer, the second writeback will hit the existing
 * (non-null) column. We re-read after the update and discard the loser
 * Customer in Stripe so we end up with one. The Stripe Customer object
 * isn't billable until an Invoice references it so a stray duplicate
 * has no cost beyond a row in Stripe's index.
 *
 * Caller passes a service-role Supabase client because this writes to
 * accounts.stripe_customer_id which RLS protects.
 */
export async function getOrCreateStripeCustomer(
  service: SupabaseClient,
  accountId: string,
): Promise<string> {
  // 1. Look up the account row + its primary profile in one shot.
  const { data: accountRaw, error: accountErr } = await service
    .from("accounts")
    .select("id, email, stripe_customer_id")
    .eq("id", accountId)
    .maybeSingle();
  if (accountErr || !accountRaw) {
    throw new Error(
      `getOrCreateStripeCustomer: account ${accountId} not found`,
    );
  }
  const account = accountRaw as {
    id: string;
    email: string | null;
    stripe_customer_id: string | null;
  };

  // 2. Already linked — re-fetch from Stripe so the caller can use any
  //    of its fields. We don't fetch unless needed (the typical caller
  //    only cares about the id).
  if (account.stripe_customer_id) {
    return account.stripe_customer_id;
  }

  // 3. Gather display fields from the primary profile (if any).
  const { data: profileRaw } = await service
    .from("patient_profiles")
    .select("first_name, last_name, phone")
    .eq("account_id", accountId)
    .eq("is_primary", true)
    .maybeSingle();
  const profile = profileRaw as {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;

  const name = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : (account.email ?? "AvoVita Customer");
  const phone = profile?.phone ?? undefined;

  // 4. Create the Stripe Customer.
  const customer = await stripe.customers.create({
    email: account.email ?? undefined,
    name,
    phone,
    metadata: { avovita_account_id: accountId },
  });

  // 5. Write back. If a concurrent call beat us, the update succeeds
  //    silently and we'll detect via re-read on the next line.
  await service
    .from("accounts")
    .update({ stripe_customer_id: customer.id })
    .eq("id", accountId)
    .is("stripe_customer_id", null); // ← race guard: only write if still null

  const { data: refreshed } = await service
    .from("accounts")
    .select("stripe_customer_id")
    .eq("id", accountId)
    .maybeSingle();
  const winningId =
    (refreshed as { stripe_customer_id: string | null } | null)
      ?.stripe_customer_id ?? customer.id;

  // 6. If we lost the race, clean up our just-created duplicate.
  if (winningId !== customer.id) {
    try {
      await stripe.customers.del(customer.id);
    } catch (err) {
      // Non-fatal — the duplicate is harmless, just clutters the
      // Stripe dashboard. Log and move on.
      console.warn(
        "[getOrCreateStripeCustomer] failed to clean up duplicate customer:",
        err,
      );
    }
  }
  return winningId;
}
