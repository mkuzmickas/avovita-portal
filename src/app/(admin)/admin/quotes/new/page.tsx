import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Auto-creates a draft quote on visit and redirects to the builder.
 * Surfaces any server-side failure as a friendly error page rather than
 * a bare 500, and emits `[new-quote]` checkpoint logs so a future failure
 * can be pinpointed from Vercel function logs.
 */
export default async function NewQuotePage() {
  const t0 = Date.now();
  const log = (label: string, extra?: unknown) =>
    console.log(
      `[new-quote] +${Date.now() - t0}ms — ${label}`,
      extra ?? ""
    );

  log("entered");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log("no user → /login");
    redirect("/login?returnUrl=/admin/quotes");
  }
  log(`user ${user.id}`);

  const service = createServiceRoleClient();

  // Role check via service-role (avoids cookie-bound RLS path that has
  // occasionally stalled or returned empty single() results)
  const { data: accountRow, error: accountErr } = await service
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (accountErr) {
    console.error("[new-quote] account lookup failed", accountErr);
    return <NewQuoteError message={`Account lookup failed: ${accountErr.message}`} />;
  }
  const account = accountRow as { role: string } | null;
  if (!account || account.role !== "admin") {
    log("non-admin → /portal");
    redirect("/portal");
  }
  log("admin confirmed");

  // Generate AVO-YYYY-NNNN number
  const year = new Date().getFullYear();
  const prefix = `AVO-${year}-`;
  const { data: lastRow, error: seqErr } = await service
    .from("quotes")
    .select("quote_number")
    .like("quote_number", `${prefix}%`)
    .order("quote_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seqErr) {
    console.error("[new-quote] quote_number lookup failed", seqErr);
    return (
      <NewQuoteError
        message={`Could not allocate a quote number: ${seqErr.message}`}
      />
    );
  }
  const last = lastRow as { quote_number: string } | null;
  let nextSeq = 1;
  if (last) {
    const parsed = parseInt(last.quote_number.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) nextSeq = parsed + 1;
  }
  const quoteNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  log(`allocated ${quoteNumber}`);

  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Empty strings rather than null for the name/email text fields —
  // matches the original schema which had these as NOT NULL. The
  // builder fills them in before send, and the email-required check
  // runs there before /api/admin/quotes/[id]/send is called.
  const insertRow = {
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
    visit_fee_cad: 0,
    total_cad: 0,
    sent_at: null,
    expires_at: expiresAt,
    created_by: user.id,
  };
  log("inserting", insertRow);

  const { data, error } = await service
    .from("quotes")
    .insert(insertRow)
    .select("id")
    .single();

  if (error || !data) {
    console.error("[new-quote] insert failed", {
      error,
      insertRow,
    });
    return (
      <NewQuoteError
        message={`Could not create the draft: ${error?.message ?? "unknown DB error"}`}
      />
    );
  }

  log(`created ${(data as { id: string }).id} → redirect`);
  redirect(`/admin/quotes/${(data as { id: string }).id}`);
}

function NewQuoteError({ message }: { message: string }) {
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <Link
        href="/admin/quotes"
        className="inline-flex items-center gap-1.5 text-sm mb-4"
        style={{ color: "#e8d5a3" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Quotes
      </Link>
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "rgba(224, 82, 82, 0.08)",
          borderColor: "#e05252",
        }}
      >
        <div className="flex items-start gap-3">
          <AlertCircle
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: "#e05252" }}
          />
          <div>
            <h1
              className="font-heading text-xl font-semibold mb-2"
              style={{ color: "#ffffff" }}
            >
              Couldn&apos;t start a new quote
            </h1>
            <p className="text-sm" style={{ color: "#e8d5a3" }}>
              {message}
            </p>
            <p className="text-xs mt-3" style={{ color: "#6ab04c" }}>
              The error is logged on the server. Try again in a moment — if it
              keeps happening, check the Vercel function logs for{" "}
              <code>[new-quote]</code> entries.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
