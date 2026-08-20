import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/admin/bookings/debug-match
 *
 * Body: { email?: string, phone?: string, lastName?: string }
 *
 * Returns diagnostic info about what the matcher CAN see for the
 * given identifiers — bypassing scoring — so we can isolate whether
 * a "no candidates" outcome is a query problem or a scoring problem.
 *
 * Admin-only.
 */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 as const };
  const { data: acct } = (await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (acct?.role !== "admin") return { ok: false, status: 403 as const };
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Admin only." }, { status: auth.status });
  }
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    phone?: string;
    lastName?: string;
  };

  const service = createServiceRoleClient();

  // 1) Count orders in last 180 days
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
  const { data: recentOrders, error: ordersErr } = await service
    .from("orders")
    .select("id, account_id, total_cad, created_at")
    .gte("created_at", sixMonthsAgo.toISOString())
    .limit(500);

  // 2) Look up accounts by email (case-insensitive)
  let accountsByEmail: unknown[] = [];
  let accountsErr: string | null = null;
  if (body.email) {
    const { data: emailHits, error: eErr } = await service
      .from("accounts")
      .select("id, email, first_name, last_name, phone")
      .ilike("email", body.email);
    accountsByEmail = emailHits ?? [];
    accountsErr = eErr?.message ?? null;
  }

  // 3) Look up accounts by phone (loose digit-only comparison)
  let accountsByPhone: unknown[] = [];
  if (body.phone) {
    const digits = body.phone.replace(/[^\d]/g, "");
    // Fetch all recent-order accounts and filter in code (Supabase
    // doesn't have a regex-strip in .filter chains).
    const acctIds = Array.from(
      new Set(
        (recentOrders ?? [])
          .map((o) => (o as { account_id: string | null }).account_id)
          .filter(Boolean),
      ),
    ) as string[];
    if (acctIds.length > 0) {
      const { data: allAccts } = await service
        .from("accounts")
        .select("id, email, first_name, last_name, phone")
        .in("id", acctIds);
      accountsByPhone = (allAccts ?? []).filter((a) => {
        const p = ((a as { phone: string | null }).phone ?? "").replace(/[^\d]/g, "");
        return p === digits || p === "1" + digits || "1" + p === digits;
      });
    }
  }

  // 4) Look up patient_profiles by last name (case-insensitive)
  let profilesByName: unknown[] = [];
  if (body.lastName) {
    const { data: nameHits } = await service
      .from("patient_profiles")
      .select("id, account_id, first_name, last_name, phone")
      .ilike("last_name", body.lastName);
    profilesByName = nameHits ?? [];
  }

  return NextResponse.json({
    orders_in_last_180d: (recentOrders ?? []).length,
    orders_query_error: ordersErr?.message ?? null,
    accounts_by_email_ilike: accountsByEmail,
    accounts_query_error: accountsErr,
    accounts_by_phone_digits: accountsByPhone,
    profiles_by_last_name: profilesByName,
  });
}
