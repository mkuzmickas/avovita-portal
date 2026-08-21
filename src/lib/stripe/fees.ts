import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

/**
 * Stripe processing fee retrieval + persistence.
 *
 * Fee is on `charge.balance_transaction.fee` (in the payment currency,
 * minor units). For AvoVita every charge is CAD so we just divide by
 * 100. Payments with multi-currency conversion (rare — none in AvoVita
 * today) would need extra handling.
 */

export interface FeeResult {
  fee_cad: number;
  currency: string;
}

/**
 * Fetch the Stripe fee for one payment intent. Returns null if the
 * PI has no successful charge yet, no balance_transaction yet
 * (usually resolves within seconds), or the currency isn't CAD.
 */
export async function fetchFeeForPaymentIntent(
  paymentIntentId: string,
): Promise<FeeResult | null> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });
  const charge =
    typeof pi.latest_charge === "object" && pi.latest_charge != null
      ? pi.latest_charge
      : null;
  if (!charge) return null;
  const bt =
    typeof charge.balance_transaction === "object" &&
    charge.balance_transaction != null
      ? charge.balance_transaction
      : null;
  if (!bt) return null;
  // bt.fee is in the SETTLEMENT currency (CAD for us). Cents → dollars.
  return {
    fee_cad: bt.fee / 100,
    currency: (bt.currency ?? "cad").toUpperCase(),
  };
}

/**
 * Backfill Stripe fees for orders that have a payment_intent_id but
 * no fee stored yet. Bounded by `limit` so a cron run doesn't blow
 * through Stripe's API rate limit or the function's max duration.
 * Safe to run repeatedly — reads only orders where stripe_fee_cad
 * IS NULL.
 */
export async function backfillStripeFees(
  service: SupabaseClient,
  limit = 100,
): Promise<{
  attempted: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  const { data: rows } = await service
    .from("orders")
    .select("id, stripe_payment_intent_id")
    .is("stripe_fee_cad", null)
    .not("stripe_payment_intent_id", "is", null)
    .in("status", ["confirmed", "shipped", "resulted", "complete"])
    .limit(limit);
  const orders = (rows ?? []) as Array<{
    id: string;
    stripe_payment_intent_id: string;
  }>;

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  for (const o of orders) {
    try {
      const fee = await fetchFeeForPaymentIntent(o.stripe_payment_intent_id);
      if (!fee) {
        skipped++;
        continue;
      }
      const { error } = await service
        .from("orders")
        .update({ stripe_fee_cad: fee.fee_cad })
        .eq("id", o.id);
      if (error) errors++;
      else updated++;
    } catch (err) {
      console.error("[stripe-fees] backfill error", o.id, err);
      errors++;
    }
  }
  return { attempted: orders.length, updated, skipped, errors };
}
