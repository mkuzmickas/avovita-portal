import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/accounts/search?q=<term>
 *
 * Admin autocomplete for the New Invoice form's "Existing client"
 * picker. Searches across account email and the primary profile's
 * first/last name. Returns up to 10 matches.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: callerAccount } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (
      (callerAccount as { role?: string } | null)?.role !== "admin"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }
    const service = createServiceRoleClient();
    const like = `%${q.replace(/[%_]/g, "")}%`;

    // Combined search: pull accounts whose email matches OR whose
    // primary patient_profile name matches. Two queries + dedupe is
    // simpler than a JSON-shape supabase-or query.
    const { data: emailHits } = await service
      .from("accounts")
      .select(
        `id, email,
         profiles:patient_profiles!inner(id, first_name, last_name, is_primary, phone)`,
      )
      .eq("role", "patient")
      .ilike("email", like)
      .limit(10);

    const { data: nameHits } = await service
      .from("accounts")
      .select(
        `id, email,
         profiles:patient_profiles!inner(id, first_name, last_name, is_primary, phone)`,
      )
      .eq("role", "patient")
      .eq("profiles.is_primary", true)
      .or(`first_name.ilike.${like},last_name.ilike.${like}`, {
        referencedTable: "profiles",
      })
      .limit(10);

    type AccountHit = {
      id: string;
      email: string | null;
      profiles: Array<{
        id: string;
        first_name: string;
        last_name: string;
        is_primary: boolean;
        phone: string | null;
      }>;
    };
    const all: AccountHit[] = [
      ...((emailHits ?? []) as AccountHit[]),
      ...((nameHits ?? []) as AccountHit[]),
    ];
    const seen = new Set<string>();
    const results = [];
    for (const acct of all) {
      if (seen.has(acct.id)) continue;
      seen.add(acct.id);
      const primary =
        acct.profiles.find((p) => p.is_primary) ?? acct.profiles[0];
      results.push({
        account_id: acct.id,
        email: acct.email,
        profile_id: primary?.id ?? null,
        first_name: primary?.first_name ?? null,
        last_name: primary?.last_name ?? null,
        phone: primary?.phone ?? null,
      });
      if (results.length >= 10) break;
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[accounts:search]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
