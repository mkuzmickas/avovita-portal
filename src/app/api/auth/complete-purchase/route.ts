import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import {
  reassembleMetadata,
  materialiseOrder,
  sendOrderConfirmationEmail,
} from "@/lib/checkout/materialise";
import type { ConsentType } from "@/types/database";

export const runtime = "nodejs";

/**
 * POST /api/auth/complete-purchase
 *
 * Called by the /checkout/success page after a *guest* checkout to:
 *   1. Verify the Stripe session and pull the cart-owning email + the
 *      embedded checkout payload (chunked metadata).
 *   2. Create the Supabase auth user (or sign in if it already exists).
 *   3. Update the pending order's `account_id` to point at the new user.
 *   4. Materialise patient_profiles, order_lines, visit_group via
 *      `materialiseOrder`.
 *   5. Insert consent rows for general PIPA + any cross-border consent
 *      sections that apply to the labs in the order.
 *   6. Send the order confirmation email.
 *
 * Body: { session_id: string, email: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId: string | undefined = body.session_id;
    const email: string | undefined = body.email;
    const password: string | undefined = body.password;

    if (!sessionId || !email || !password) {
      return NextResponse.json(
        { error: "session_id, email and password are required" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // 1. Verify Stripe session + reassemble payload
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 }
      );
    }

    const payload = reassembleMetadata(
      session.metadata as Record<string, string> | null
    );
    if (!payload) {
      return NextResponse.json(
        { error: "Could not load order details from Stripe session" },
        { status: 500 }
      );
    }

    const supabase = createServiceRoleClient();

    // 2. Find the pending order (created by the webhook)
    const { data: pendingOrderRaw, error: orderLookupErr } = await supabase
      .from("orders")
      .select("id, account_id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (orderLookupErr) {
      return NextResponse.json(
        { error: `Failed to load order: ${orderLookupErr.message}` },
        { status: 500 }
      );
    }
    const pendingOrder = pendingOrderRaw as
      | { id: string; account_id: string | null }
      | null;
    if (!pendingOrder) {
      return NextResponse.json(
        {
          error:
            "Order not found yet — please refresh in a moment. The webhook may still be processing.",
        },
        { status: 404 }
      );
    }

    // If the order already has an account, this is a logged-in checkout —
    // just bounce them to the portal without doing anything.
    if (pendingOrder.account_id) {
      return NextResponse.json({
        success: true,
        already_linked: true,
        order_id: pendingOrder.id,
      });
    }

    // 3. Create or sign in the Supabase Auth user
    let userId: string | null = null;

    const { data: createData, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr) {
      // If the user already exists, sign in to verify the password is correct
      const { data: signInData, error: signInErr } =
        await supabase.auth.signInWithPassword({ email, password });

      if (signInErr || !signInData.user) {
        return NextResponse.json(
          {
            error:
              "An account already exists for this email but the password is incorrect. Please sign in to your existing account from the login page.",
          },
          { status: 409 }
        );
      }
      userId = signInData.user.id;
    } else {
      userId = createData.user?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    // Trigger should auto-create the accounts row, but ensure it exists
    await supabase
      .from("accounts")
      .upsert({ id: userId, email }, { onConflict: "id" });

    // 4. Link the order to the new account & inject the resolved id into
    //    the payload so materialiseOrder can use it
    const { error: linkErr } = await supabase
      .from("orders")
      .update({
        account_id: userId,
        notes: null, // clear the stashed payload
      })
      .eq("id", pendingOrder.id);

    if (linkErr) {
      console.error("[complete-purchase] failed to link order:", linkErr);
    }

    const enrichedPayload = { ...payload, account_user_id: userId };

    // 5. Materialise profiles + order_lines + visit_group
    await materialiseOrder(supabase, pendingOrder.id, enrichedPayload);

    // 6. Insert consent rows
    await insertConsents(supabase, userId, enrichedPayload);

    // 7. Send the confirmation email (was skipped on the webhook side
    //    because the order had no account at that point)
    await sendOrderConfirmationEmail(supabase, pendingOrder.id, enrichedPayload, sessionId);

    return NextResponse.json({
      success: true,
      order_id: pendingOrder.id,
      user_id: userId,
    });
  } catch (err) {
    console.error("[complete-purchase] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── Consent helpers ──────────────────────────────────────────────────

const US_LABS = new Set([
  "Mayo Clinic Laboratories",
  "ReligenDx",
  "Precision Epigenomics",
]);
const DE_LABS = new Set(["Armin Labs"]);

async function insertConsents(
  supabase: ReturnType<typeof createServiceRoleClient>,
  accountId: string,
  payload: Awaited<ReturnType<typeof reassembleMetadata>> & object
) {
  if (!payload) return;

  // Resolve labs from the assigned tests
  const testIds = [...new Set(payload.assignments.map((a) => a.test_id))];
  const { data: testsRaw } = await supabase
    .from("tests")
    .select("lab:labs(name)")
    .in("id", testIds);

  type Row = { lab: { name: string } | { name: string }[] | null };
  const rows = (testsRaw ?? []) as unknown as Row[];

  const labNames = new Set<string>();
  for (const r of rows) {
    const lab = Array.isArray(r.lab) ? r.lab[0] : r.lab;
    if (lab?.name) labNames.add(lab.name);
  }

  const consentTypes: ConsentType[] = ["general_pipa"];
  const hasUs = Array.from(labNames).some((n) => US_LABS.has(n));
  const hasDe = Array.from(labNames).some((n) => DE_LABS.has(n));
  if (hasUs) consentTypes.push("cross_border_us");
  if (hasDe) consentTypes.push("cross_border_de");

  const rowsToInsert = consentTypes.map((ct) => ({
    account_id: accountId,
    profile_id: null,
    consent_type: ct,
    consent_text_version: "1.0",
    ip_address: null,
    user_agent: null,
  }));

  const { error: consentErr } = await supabase
    .from("consents")
    .insert(rowsToInsert);
  if (consentErr) {
    console.error("[complete-purchase] consent insert failed:", consentErr);
  }
}
