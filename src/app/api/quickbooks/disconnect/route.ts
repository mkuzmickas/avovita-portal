import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/quickbooks/oauth";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/quickbooks/disconnect
 *
 * Admin-only. Revokes the current refresh token with Intuit and
 * deletes the integrations row. Does NOT touch qbo_transactions —
 * historical data stays for reporting. Reconnecting later starts
 * fresh sync from the connect date onward.
 */
export async function POST() {
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

  const service = createServiceRoleClient();
  const { data: integ } = await service
    .from("integrations")
    .select("refresh_token")
    .eq("provider", "quickbooks")
    .maybeSingle();

  if (integ) {
    try {
      await revokeToken((integ as { refresh_token: string }).refresh_token);
    } catch (err) {
      // Revoke best-effort — even if Intuit rejects (e.g. token
      // already expired) we still want to delete our local row.
      console.warn("[qbo:disconnect] revoke failed:", err);
    }
    await service.from("integrations").delete().eq("provider", "quickbooks");
  }

  return NextResponse.json({ ok: true });
}
