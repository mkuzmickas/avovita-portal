/**
 * Dump everything we know about one account: order metadata, results
 * (with file names), stripe references, any notes. Used to hunt for
 * a patient name when the profile has null first/last.
 *
 * Usage:
 *   node scripts/inspect-account-full.mjs <account_id>
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const accountId = process.argv[2];
if (!accountId) {
  console.error("Pass an account id.");
  process.exit(1);
}

const { data: acct } = await supabase
  .from("accounts")
  .select("*")
  .eq("id", accountId)
  .maybeSingle();
console.log("account:", acct);

const { data: profs } = await supabase
  .from("patient_profiles")
  .select("*")
  .eq("account_id", accountId);
console.log("\nprofiles:");
for (const p of profs ?? []) console.log(" ", p);

const profileIds = (profs ?? []).map((p) => p.id);

const { data: orders } = await supabase
  .from("orders")
  .select("*")
  .eq("account_id", accountId);
console.log("\norders:");
for (const o of orders ?? []) {
  console.log(" ", {
    id: o.id.slice(0, 8),
    status: o.status,
    total: o.total_cad,
    created: o.created_at,
    stripe_pi: o.stripe_payment_intent_id,
    stripe_session: o.stripe_session_id,
    notes: o.notes,
    mayo_order_number: o.mayo_order_number,
    mayo_ml: o.mayo_ml_order_number,
    mayo_mrn: o.mayo_patient_id,
    appointment_at: o.appointment_at,
    appointment_date: o.appointment_date,
    fedex: o.fedex_tracking_number,
    shipping_addr: o.supplement_shipping_address,
  });
}

if (profileIds.length > 0) {
  const { data: results } = await supabase
    .from("results")
    .select("id, file_name, uploaded_at, source, description, storage_path")
    .in("profile_id", profileIds);
  console.log("\nresults:");
  for (const r of results ?? []) console.log(" ", r);
}
