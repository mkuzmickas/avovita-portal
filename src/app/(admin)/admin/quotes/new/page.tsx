import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Auto-creates a draft quote on visit and redirects to the builder.
 * Mirrors the POST /api/admin/quotes logic to avoid an internal HTTP hop.
 */
export default async function NewQuotePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?returnUrl=/admin/quotes");

  const { data: accountRow } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const account = accountRow as { role: string } | null;
  if (!account || account.role !== "admin") redirect("/portal");

  const service = createServiceRoleClient();

  const year = new Date().getFullYear();
  const prefix = `AVO-${year}-`;
  const { data: lastRow } = await service
    .from("quotes")
    .select("quote_number")
    .like("quote_number", `${prefix}%`)
    .order("quote_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = lastRow as { quote_number: string } | null;
  let nextSeq = 1;
  if (last) {
    const parsed = parseInt(last.quote_number.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) nextSeq = parsed + 1;
  }
  const quoteNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await service
    .from("quotes")
    .insert({
      quote_number: quoteNumber,
      client_first_name: "",
      client_last_name: "",
      client_email: "",
      person_count: 1,
      collection_city: null,
      notes: null,
      status: "draft",
      subtotal_cad: 0,
      discount_cad: 0,
      visit_fee_cad: 85,
      total_cad: 85,
      sent_at: null,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create quote: ${error?.message ?? "unknown"}`);
  }

  redirect(`/admin/quotes/${(data as { id: string }).id}`);
}
