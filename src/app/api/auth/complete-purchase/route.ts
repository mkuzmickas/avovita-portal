import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { resend } from "@/lib/resend";
import {
  reassembleMetadata,
  materialiseOrder,
  sendOrderConfirmationEmail,
  type OrderMetadataPayload,
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

    // 8. Create own accounts for additional people who opted in
    await createOwnAccountsForAdditionalPersons(
      supabase,
      enrichedPayload,
      pendingOrder.id,
      userId
    );

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

// ─── Own-account creation for additional people ──────────────────────

async function createOwnAccountsForAdditionalPersons(
  supabase: ReturnType<typeof createServiceRoleClient>,
  payload: OrderMetadataPayload,
  orderId: string,
  primaryAccountId: string
): Promise<void> {
  const personsWantingOwnAccount = payload.persons.filter(
    (p) => !p.is_account_holder && p.wants_own_account && p.own_account_email
  );

  if (personsWantingOwnAccount.length === 0) return;

  const primaryHolder = payload.persons.find((p) => p.is_account_holder);
  const primaryFirstName = primaryHolder?.first_name ?? "Someone";
  const portalUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";

  for (const person of personsWantingOwnAccount) {
    const email = person.own_account_email!.trim();

    try {
      // 1. Create Supabase auth user (skip if already exists)
      let newUserId: string | null = null;

      const { data: createData, error: createErr } =
        await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
        });

      if (createErr) {
        // User may already exist — look them up
        const { data: listData } =
          await supabase.auth.admin.listUsers();
        const existing = listData?.users?.find(
          (u) => u.email === email
        );
        if (existing) {
          newUserId = existing.id;
        } else {
          console.error(
            `[complete-purchase] failed to create user for ${email}:`,
            createErr
          );
          continue;
        }
      } else {
        newUserId = createData.user?.id ?? null;
      }

      if (!newUserId) continue;

      // 2. Upsert accounts row
      await supabase
        .from("accounts")
        .upsert({ id: newUserId, email }, { onConflict: "id" });

      // 3. Find the profile created under the primary account for this person
      const { data: sourceProfileRaw } = await supabase
        .from("patient_profiles")
        .select("*")
        .eq("account_id", primaryAccountId)
        .eq("first_name", person.first_name)
        .eq("last_name", person.last_name)
        .eq("date_of_birth", person.date_of_birth)
        .maybeSingle();

      const sourceProfile = sourceProfileRaw as {
        id: string;
        first_name: string;
        last_name: string;
        date_of_birth: string;
        biological_sex: string;
        phone: string | null;
        address_line1: string | null;
        address_line2: string | null;
        city: string | null;
        province: string | null;
        postal_code: string | null;
        is_minor: boolean;
        relationship: string | null;
      } | null;

      if (!sourceProfile) {
        console.error(
          `[complete-purchase] no source profile found for ${person.first_name} ${person.last_name}`
        );
        continue;
      }

      // Create a copy of the profile under the new account
      const { data: newProfileRaw } = await supabase
        .from("patient_profiles")
        .insert({
          account_id: newUserId,
          first_name: sourceProfile.first_name,
          last_name: sourceProfile.last_name,
          date_of_birth: sourceProfile.date_of_birth,
          biological_sex: sourceProfile.biological_sex,
          phone: sourceProfile.phone,
          address_line1: sourceProfile.address_line1,
          address_line2: sourceProfile.address_line2,
          city: sourceProfile.city,
          province: sourceProfile.province,
          postal_code: sourceProfile.postal_code,
          is_minor: sourceProfile.is_minor,
          is_primary: true,
          relationship: sourceProfile.relationship,
        })
        .select("id")
        .single();

      const newProfileId =
        (newProfileRaw as { id: string } | null)?.id ?? null;

      // 4. Update order_lines for this person to point to the new profile
      if (newProfileId) {
        await supabase
          .from("order_lines")
          .update({ profile_id: newProfileId })
          .eq("order_id", orderId)
          .eq("profile_id", sourceProfile.id);
      }

      // 5. Send invite email with magic link
      const { data: linkData } =
        await supabase.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: {
            redirectTo: `${portalUrl}/portal`,
          },
        });

      const magicLink =
        linkData?.properties?.action_link ?? `${portalUrl}/login`;

      await resend.emails.send({
        from: process.env.RESEND_FROM_ORDERS!,
        to: email,
        subject: "Your AvoVita results account is ready",
        html: renderInviteEmail(
          person.first_name,
          primaryFirstName,
          magicLink,
          portalUrl
        ),
      });

      // Log notification
      await supabase.from("notifications").insert({
        profile_id: newProfileId,
        order_id: orderId,
        result_id: null,
        channel: "email",
        template: "own_account_invite",
        recipient: email,
        status: "sent",
      });

      console.log(
        `[complete-purchase] own account created for ${email}, invite sent`
      );
    } catch (err) {
      console.error(
        `[complete-purchase] own account creation failed for ${email}:`,
        err
      );
    }
  }
}

function renderInviteEmail(
  firstName: string,
  primaryFirstName: string,
  magicLink: string,
  portalUrl: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f2614;padding:32px;text-align:center;border-bottom:3px solid #c4973a;">
    <h1 style="margin:0;font-size:28px;font-family:Georgia,'Cormorant Garamond',serif;color:#ffffff;">AvoVita <span style="color:#c4973a;">Wellness</span></h1>
    <p style="margin:8px 0 0;font-size:13px;color:#8dc63f;">PRIVATE LAB TESTING · CALGARY</p>
  </td></tr>
  <tr><td style="padding:36px 32px 16px;">
    <h2 style="margin:0 0 12px;font-size:24px;font-family:Georgia,'Cormorant Garamond',serif;color:#111827;">
      Your results account is ready, ${esc(firstName)}
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.5;">
      ${esc(primaryFirstName)} has placed a lab testing order that includes tests for you through AvoVita Wellness. Your account has been created so you can access your results privately.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.5;">
      Click the button below to set up your password and access your portal.
    </p>
  </td></tr>
  <tr><td style="padding:0 32px 32px;text-align:center;">
    <a href="${magicLink}" target="_blank" style="display:inline-block;background:#c4973a;color:#0a1a0d;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;">
      Set Up My Account
    </a>
  </td></tr>
  <tr><td style="padding:0 32px 28px;">
    <div style="background:#f9fafb;border-left:4px solid #0f2614;padding:16px;border-radius:4px;">
      <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5;">
        Once your specimens are processed, your lab results will be uploaded to your portal and you'll receive an email notification.
      </p>
    </div>
  </td></tr>
  <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">
      Questions? Contact <a href="mailto:support@avovita.ca" style="color:#0f2614;font-weight:600;">support@avovita.ca</a>
    </p>
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">AvoVita Wellness · Calgary, AB</p>
    <p style="margin:0;font-size:11px;color:#9ca3af;">Your health information is protected under Alberta PIPA.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
