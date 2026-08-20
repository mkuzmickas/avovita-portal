import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * GET /api/admin/orders/search?q=<query>&limit=25
 *
 * Free-text order search for the Mayo matcher's "search all orders"
 * picker — the fallback when the auto-suggester can't find candidates
 * because the patient is booked under a different name (e.g. wife
 * paid for husband, dependent under a shared account, name spelled
 * differently on the portal).
 *
 * Search matches:
 *   - patient_profiles.first_name / last_name (substring, ILIKE)
 *   - accounts.email (substring)
 * Returns matching orders ordered by created_at desc, along with the
 * portal test names on each order so the caller can render the same
 * chips the auto-candidate list uses.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: account } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10) || 25),
  );

  if (q.length < 2) {
    return NextResponse.json({ orders: [] });
  }

  const service = createServiceRoleClient();

  // Find profiles matching the query, then also accounts by email.
  // Combine into an account_id list.
  const like = `%${q}%`;
  const [{ data: profileHits }, { data: accountHits }] = await Promise.all([
    service
      .from("patient_profiles")
      .select("id, account_id, first_name, last_name, date_of_birth")
      .or(`first_name.ilike.${like},last_name.ilike.${like}`)
      .limit(100),
    service
      .from("accounts")
      .select("id, email")
      .ilike("email", like)
      .limit(50),
  ]);
  const profileList =
    (profileHits ?? []) as Array<{
      id: string;
      account_id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
    }>;
  const accountList = (accountHits ?? []) as Array<{
    id: string;
    email: string | null;
  }>;
  const accountIds = [
    ...new Set([
      ...profileList.map((p) => p.account_id),
      ...accountList.map((a) => a.id),
    ]),
  ];
  if (accountIds.length === 0) {
    return NextResponse.json({ orders: [] });
  }

  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      "id, account_id, appointment_at, appointment_date, shipping_date, shipped_at, created_at, total_cad, status",
    )
    .in("account_id", accountIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  const orders = (ordersRaw ?? []) as Array<{
    id: string;
    account_id: string;
    appointment_at: string | null;
    appointment_date: string | null;
    shipping_date: string | null;
    shipped_at: string | null;
    created_at: string;
    total_cad: number | null;
    status: string;
  }>;
  if (orders.length === 0) {
    return NextResponse.json({ orders: [] });
  }

  const orderIds = orders.map((o) => o.id);

  // Test names per order (for chip display)
  const { data: linesRaw } = await service
    .from("order_lines")
    .select("order_id, test:tests ( name )")
    .in("order_id", orderIds)
    .eq("line_type", "test");
  interface LineJoin {
    order_id: string;
    test: { name: string | null } | null;
  }
  const orderTestNames = new Map<string, string[]>();
  for (const l of (linesRaw ?? []) as unknown as LineJoin[]) {
    const name = l.test?.name ?? null;
    if (!name) continue;
    const arr = orderTestNames.get(l.order_id) ?? [];
    arr.push(name);
    orderTestNames.set(l.order_id, arr);
  }

  // Profile lookup by account_id (best-effort — first profile on the
  // account). For orders on an account with multiple profiles, this
  // shows the first-alphabetical one; good enough for the picker.
  const profileByAccount = new Map<
    string,
    { first_name: string; last_name: string; date_of_birth: string | null }
  >();
  for (const p of profileList) {
    if (!profileByAccount.has(p.account_id)) {
      profileByAccount.set(p.account_id, {
        first_name: p.first_name,
        last_name: p.last_name,
        date_of_birth: p.date_of_birth,
      });
    }
  }

  // If the query matched by email, we still need SOME profile info.
  // Best-effort: hit patient_profiles for accountIds we don't have yet.
  const missingAccountIds = accountIds.filter(
    (a) => !profileByAccount.has(a),
  );
  if (missingAccountIds.length > 0) {
    const { data: extraProfiles } = await service
      .from("patient_profiles")
      .select("account_id, first_name, last_name, date_of_birth")
      .in("account_id", missingAccountIds);
    for (const p of (extraProfiles ?? []) as Array<{
      account_id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
    }>) {
      if (!profileByAccount.has(p.account_id)) {
        profileByAccount.set(p.account_id, {
          first_name: p.first_name,
          last_name: p.last_name,
          date_of_birth: p.date_of_birth,
        });
      }
    }
  }

  const results = orders.map((o) => {
    const p = profileByAccount.get(o.account_id) ?? null;
    return {
      order_id: o.id,
      patient_name: p ? `${p.first_name} ${p.last_name}` : "(unknown)",
      patient_first: p?.first_name ?? "",
      patient_last: p?.last_name ?? "",
      patient_dob: p?.date_of_birth ?? null,
      appointment_at: o.appointment_at,
      shipping_date: o.shipping_date,
      created_at: o.created_at,
      order_total_cad: o.total_cad,
      status: o.status,
      test_overlap: 0,
      test_names: orderTestNames.get(o.id) ?? [],
      matched_test_names: [] as string[],
      score: 0,
      reason: "manual search",
    };
  });

  return NextResponse.json({ orders: results });
}
