import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A repeat client = an account with at least one prior paid order in
 * the system. "Paid" is anything past 'pending' and not 'cancelled' —
 * i.e. money changed hands and the order was accepted.
 *
 * The multi-test discount ($20 off per line, 2+ lines) is gated on
 * this — new/first-time customers see catalogue price parity; repeat
 * customers get the reward. Marketed as "repeat clients receive
 * additional discounts applied at check out."
 *
 * Every order carries a NOT NULL account_id (guests are materialised
 * into an accounts row at webhook time via the post-purchase password
 * gate), so there are no truly orphan orders — this single-column
 * check is authoritative.
 */
const QUALIFYING_STATUSES = [
  "confirmed",
  "collected",
  "shipped",
  "resulted",
  "complete",
];

export async function isRepeatClient(
  supabase: SupabaseClient,
  accountId: string | null | undefined,
): Promise<boolean> {
  if (!accountId) return false;
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .in("status", QUALIFYING_STATUSES);
  if (error) {
    console.error(
      "[repeatClientEligibility] Failed to count prior orders — defaulting to not-eligible:",
      error.message,
    );
    return false;
  }
  return (count ?? 0) >= 1;
}
