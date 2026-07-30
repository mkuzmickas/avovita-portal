import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/accounts/new-client
 *
 * Admin shortcut to create a brand-new customer record from inside the
 * New Invoice form.
 *
 *   Full mode (default): creates auth user + accounts row + primary
 *     patient_profiles row. Used when the invoice includes tests —
 *     the profile is needed for the collection workflow.
 *
 *   Minimal mode ({ minimal: true }): creates auth user + accounts
 *     row only, no patient_profile. Used for supplement-only invoices
 *     where the customer never has to log into the portal or book a
 *     collection. First / last name and phone are optional; only
 *     email is required. Downstream: invoice.paid webhook skips the
 *     order-line mirror (needs a profile_id) and details API / PDF
 *     fall back to invoice_line_items — nothing else is affected.
 *
 * The customer doesn't get a welcome email either way — the invoice
 * notification email sent immediately afterwards covers first contact.
 *
 * Body:
 *   { email, first_name, last_name, phone, date_of_birth?, minimal? }
 */
export async function POST(request: NextRequest) {
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
    if ((callerAccount as { role?: string } | null)?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const minimal = body.minimal === true;
    const email = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const dob: string | null = body.date_of_birth?.trim() || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 },
      );
    }
    if (!minimal && (!firstName || !lastName)) {
      return NextResponse.json(
        { error: "First and last name are required" },
        { status: 400 },
      );
    }
    if (!minimal && !phone) {
      return NextResponse.json(
        { error: "Phone is required for SMS notification" },
        { status: 400 },
      );
    }

    const service = createServiceRoleClient();

    // If an account already exists with this email, return it instead
    // of trying to create a duplicate.
    const { data: existing } = await service
      .from("accounts")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          error: "An account with this email already exists. Use the existing-client search instead.",
        },
        { status: 409 },
      );
    }

    // Create the auth user via the admin API so we can pre-set the
    // email. The patient_profiles row trigger from migration 001 (the
    // accounts handle_new_user trigger) inserts the accounts row
    // automatically; here we do a manual UPDATE to set first/last name
    // fields if the trigger doesn't.
    const adminAuth = service.auth.admin;
    const { data: createUserData, error: createUserErr } =
      await adminAuth.createUser({
        email,
        email_confirm: false,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
        },
      });
    if (createUserErr || !createUserData?.user) {
      return NextResponse.json(
        {
          error: `Failed to create auth user: ${createUserErr?.message ?? "unknown"}`,
        },
        { status: 500 },
      );
    }
    const authUserId = createUserData.user.id;

    // Full mode inserts the primary patient_profiles row. Minimal
    // mode (supplement-only invoice) skips this entirely — the
    // customer never touches the collection workflow.
    let profileId: string | null = null;
    if (!minimal) {
      const { data: profileInsertRaw, error: profileErr } = await service
        .from("patient_profiles")
        .insert({
          account_id: authUserId,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dob ?? "1900-01-01",
          biological_sex: "intersex", // placeholder; admin updates if known
          phone,
          is_primary: true,
          is_dependent: false,
          relationship: "account_holder",
        })
        .select("id")
        .single();
      if (profileErr || !profileInsertRaw) {
        return NextResponse.json(
          {
            error: `Failed to create profile: ${profileErr?.message ?? "unknown"}`,
          },
          { status: 500 },
        );
      }
      profileId = (profileInsertRaw as { id: string }).id;
    }

    // Make sure the accounts row carries the email + phone. Skip phone
    // in minimal mode when the admin didn't supply one.
    const accountsPatch: Record<string, string> = { email };
    if (phone) accountsPatch.phone = phone;
    await service.from("accounts").update(accountsPatch).eq("id", authUserId);

    return NextResponse.json({
      account_id: authUserId,
      profile_id: profileId,
      email,
      first_name: firstName || null,
      last_name: lastName || null,
      phone: phone || null,
      minimal,
    });
  } catch (err) {
    console.error("[accounts:new-client]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
