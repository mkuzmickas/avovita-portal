/**
 * One-shot diagnostic: for each order-id prefix passed in, dump the
 * account, order_lines (with profile_id / test), and any mayo
 * identifiers so we can figure out why the patient name is "null null".
 *
 * Usage:
 *   node scripts/inspect-orphan-orders.mjs 3F7F3961 9581000A E110B2F8
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const prefixes = process.argv.slice(2).map((p) => p.toLowerCase());
if (prefixes.length === 0) {
  console.error("Pass one or more 8-char order-id prefixes.");
  process.exit(1);
}

// UUID prefix search — fetch a wide recent slice and filter client-side.
const { data: recent, error: recentErr } = await supabase
  .from("orders")
  .select(
    "id, account_id, status, total_cad, created_at, mayo_order_number, mayo_ml_order_number, mayo_patient_id, fedex_tracking_number, shipped_at, appointment_at, appointment_date, order_lines(id, line_type, profile_id, test:tests(name), profile:patient_profiles(id, first_name, last_name, is_primary))",
  )
  .order("created_at", { ascending: false })
  .limit(2000);
if (recentErr) {
  console.error(recentErr.message);
  process.exit(1);
}

for (const pfx of prefixes) {
  const orders = (recent ?? []).filter((o) =>
    o.id.replace(/-/g, "").toLowerCase().startsWith(pfx),
  );
  if (orders.length === 0) {
    console.log(`\n===== ${pfx.toUpperCase()} not found in last 2000 orders =====`);
    continue;
  }
  for (const o of orders) {
    console.log("\n=====", o.id, "=====");
    console.log(
      `  account=${o.account_id}  status=${o.status}  total=${o.total_cad}`,
    );
    console.log(
      `  mayo: order_no=${o.mayo_order_number}  ml=${o.mayo_ml_order_number}  mrn=${o.mayo_patient_id}`,
    );
    console.log(
      `  ship: tracking=${o.fedex_tracking_number}  shipped_at=${o.shipped_at}  collected=${o.appointment_at ?? o.appointment_date}`,
    );

    const { data: acct } = await supabase
      .from("accounts")
      .select("email, phone, is_representative")
      .eq("id", o.account_id)
      .maybeSingle();
    console.log(`  account_email=${acct?.email}  rep=${acct?.is_representative}`);

    const { data: profs } = await supabase
      .from("patient_profiles")
      .select("id, first_name, last_name, date_of_birth, is_primary")
      .eq("account_id", o.account_id);
    console.log(`  profiles on account (${profs?.length ?? 0}):`);
    for (const p of profs ?? [])
      console.log(
        `    ${p.id.slice(0, 8)}  ${p.first_name} ${p.last_name}  DOB=${p.date_of_birth}  primary=${p.is_primary}`,
      );

    for (const l of o.order_lines ?? []) {
      const t = Array.isArray(l.test) ? l.test[0] : l.test;
      const pr = Array.isArray(l.profile) ? l.profile[0] : l.profile;
      console.log(
        `  line ${l.id.slice(0, 8)}  type=${l.line_type}  profile_id=${l.profile_id}  test="${t?.name}"  profile=${pr ? `${pr.first_name} ${pr.last_name}` : "NULL"}`,
      );
    }
  }
}
