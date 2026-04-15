import "server-only";
import { resend } from "@/lib/resend";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import {
  orderConfirmationSubject,
  renderOrderConfirmationEmail,
  type OrderConfirmationTest,
} from "@/lib/emails/orderConfirmation";
import { logNotification } from "@/lib/notifications";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Reassembled multi-person checkout payload, as serialised by
 * /api/stripe/checkout into Stripe metadata and reassembled by the
 * webhook (or by /api/auth/complete-purchase for guest checkouts).
 */
export interface OrderMetadataPayload {
  version: number;
  account_user_id: string | null;
  collection_address: {
    address_line1: string;
    address_line2: string;
    city: string;
    province: string;
    postal_code: string;
  };
  persons: Array<{
    index: number;
    is_account_holder: boolean;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    biological_sex: "male" | "female" | "intersex";
    relationship: string | null;
    phone?: string | null;
    wants_own_account?: boolean;
    own_account_email?: string | null;
  }>;
  assignments: Array<{
    test_id: string;
    person_index: number;
    unit_price_cad: number;
  }>;
  visit_fees: {
    base: number;
    additional_per_person: number;
    additional_count: number;
    total: number;
  };
  subtotal: number;
  /** Multi-test discount total ($20 × line count, 0 if under threshold). */
  discount_cad: number;
  total: number;
  /** Promo code applied at checkout (e.g. "AVOVITA-TEST"), if any. */
  promo_code?: string | null;
  /** Tagged organization (white-label partner) the order was placed via. */
  org_id?: string | null;
  /**
   * Representative (caregiver / POA) block, mirrored from CheckoutPayload.
   * When present, every person in `persons[]` is a dependent client and
   * the account gets provisioned under the rep's contact info instead of
   * the first person's.
   */
  representative?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    relationship:
      | "power_of_attorney"
      | "parent_guardian"
      | "spouse_partner"
      | "healthcare_worker"
      | "other";
    poa_confirmed: boolean;
  } | null;
}

/**
 * Reassembles `chunk_0`, `chunk_1`, … values from a Stripe metadata
 * record back into the original JSON payload. Returns null if the
 * metadata doesn't carry a chunked v1 payload.
 */
export function reassembleMetadata(
  metadata: Record<string, string> | null | undefined
): OrderMetadataPayload | null {
  if (!metadata) return null;
  const chunkCount = parseInt(metadata.chunk_count ?? "0", 10);
  if (!chunkCount) return null;
  const parts: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const part = metadata[`chunk_${i}`];
    if (typeof part !== "string") return null;
    parts.push(part);
  }
  try {
    return JSON.parse(parts.join("")) as OrderMetadataPayload;
  } catch (err) {
    console.error("[checkout] metadata reassembly failed:", err);
    return null;
  }
}

/**
 * Materialises an order's profiles, order_lines, and visit_group from
 * a reassembled metadata payload. Used by both:
 *   - the Stripe webhook (logged-in checkout — runs immediately)
 *   - /api/auth/complete-purchase (guest checkout — runs after the
 *     account has been created and the order's account_id has been
 *     updated to point at it)
 */
export async function materialiseOrder(
  supabase: ServiceClient,
  orderId: string,
  payload: OrderMetadataPayload
): Promise<{ profileIdByPersonIndex: Map<number, string> }> {
  const accountId = payload.account_user_id;
  if (!accountId) {
    throw new Error("materialiseOrder requires payload.account_user_id");
  }

  const profileIdByPersonIndex = new Map<number, string>();

  // Find existing profiles on this account so we don't duplicate
  const { data: existingProfilesRaw } = await supabase
    .from("patient_profiles")
    .select(
      "id, first_name, last_name, date_of_birth, is_primary, relationship"
    )
    .eq("account_id", accountId);

  type ExistingProfileRow = {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    is_primary: boolean;
    relationship: string | null;
  };
  const existingProfiles =
    (existingProfilesRaw as ExistingProfileRow[] | null) ?? [];

  for (const person of payload.persons) {
    let matched: ExistingProfileRow | undefined;

    if (person.is_account_holder) {
      matched =
        existingProfiles.find(
          (p) =>
            p.is_primary &&
            p.first_name.trim().toLowerCase() ===
              person.first_name.trim().toLowerCase() &&
            p.last_name.trim().toLowerCase() ===
              person.last_name.trim().toLowerCase()
        ) ?? existingProfiles.find((p) => p.is_primary);
    } else {
      matched = existingProfiles.find(
        (p) =>
          !p.is_primary &&
          p.first_name.trim().toLowerCase() ===
            person.first_name.trim().toLowerCase() &&
          p.last_name.trim().toLowerCase() ===
            person.last_name.trim().toLowerCase() &&
          p.date_of_birth === person.date_of_birth
      );
    }

    if (matched) {
      profileIdByPersonIndex.set(person.index, matched.id);
      continue;
    }

    // Caregiver flow: every person is a dependent. Use the rep's
    // relationship as the client-to-rep relationship, stamp poa
    // acknowledgement, and clear is_primary (the account has no
    // non-dependent patient profile — notifications fall back to
    // accounts.email + accounts.phone).
    const rep = payload.representative ?? null;
    const isDependent = !!rep;
    const profileRelationship = rep
      ? rep.relationship
      : person.relationship;

    const { data: insertedRaw, error: profileErr } = await supabase
      .from("patient_profiles")
      .insert({
        account_id: accountId,
        first_name: person.first_name,
        last_name: person.last_name,
        date_of_birth: person.date_of_birth,
        biological_sex: person.biological_sex,
        phone: isDependent ? null : (person.phone ?? null),
        address_line1: payload.collection_address.address_line1,
        address_line2: payload.collection_address.address_line2 || null,
        city: payload.collection_address.city,
        province: payload.collection_address.province,
        postal_code: payload.collection_address.postal_code,
        is_minor: false,
        is_primary: isDependent ? false : person.is_account_holder,
        relationship: profileRelationship,
        is_dependent: isDependent,
        poa_confirmed: isDependent ? !!rep.poa_confirmed : false,
        poa_confirmed_at:
          isDependent && rep.poa_confirmed ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (profileErr || !insertedRaw) {
      throw new Error(
        `Failed to create profile for ${person.first_name}: ${profileErr?.message}`
      );
    }
    profileIdByPersonIndex.set(
      person.index,
      (insertedRaw as { id: string }).id
    );
  }

  // 2. order_lines
  const orderLinesPayload = payload.assignments.map((a) => {
    const profileId = profileIdByPersonIndex.get(a.person_index);
    if (!profileId) {
      throw new Error(`No profile resolved for person ${a.person_index}`);
    }
    return {
      order_id: orderId,
      test_id: a.test_id,
      profile_id: profileId,
      quantity: 1,
      unit_price_cad: a.unit_price_cad,
    };
  });

  const { error: linesErr } = await supabase
    .from("order_lines")
    .insert(orderLinesPayload);

  if (linesErr) {
    console.error(
      `[checkout] Failed to create order_lines for ${orderId}:`,
      linesErr
    );
  }

  // 3. visit_group
  const { error: visitErr } = await supabase.from("visit_groups").insert({
    order_id: orderId,
    address_line1: payload.collection_address.address_line1,
    address_line2: payload.collection_address.address_line2 || null,
    city: payload.collection_address.city,
    province: payload.collection_address.province,
    postal_code: payload.collection_address.postal_code,
    base_fee_cad: payload.visit_fees.base,
    additional_person_count: payload.visit_fees.additional_count,
    additional_fee_cad:
      payload.visit_fees.additional_per_person *
      payload.visit_fees.additional_count,
    total_fee_cad: payload.visit_fees.total,
  });

  if (visitErr) {
    console.error(
      `[checkout] Failed to create visit_group for ${orderId}:`,
      visitErr
    );
  }

  return { profileIdByPersonIndex };
}

/**
 * Sends the order confirmation email using the resultsReady-style branded
 * template. Resolves test details from Supabase and detects fasting tests
 * from the turnaround_display string.
 */
export async function sendOrderConfirmationEmail(
  supabase: ServiceClient,
  orderId: string,
  payload: OrderMetadataPayload,
  stripeSessionId?: string,
  /**
   * Magic-link confirmation URL for newly auto-created guest accounts.
   * Pass null/undefined for already-confirmed customers (logged-in flow
   * or returning guests).
   */
  confirmationLink?: string | null
): Promise<void> {
  try {
    const accountId = payload.account_user_id;
    if (!accountId) return;

    const { data: accountRaw } = await supabase
      .from("accounts")
      .select("email")
      .eq("id", accountId)
      .single();
    const account = accountRaw as { email: string | null } | null;
    if (!account?.email) return;

    const accountHolder = payload.persons.find((p) => p.is_account_holder);
    const firstName = accountHolder?.first_name || "there";

    const testIds = [...new Set(payload.assignments.map((a) => a.test_id))];
    const { data: testsRaw } = await supabase
      .from("tests")
      .select("id, name, turnaround_display, lab:labs(name)")
      .in("id", testIds);

    type TestRow = {
      id: string;
      name: string;
      turnaround_display: string | null;
      lab: { name: string } | { name: string }[] | null;
    };
    const testMap = new Map<string, TestRow>();
    for (const t of (testsRaw ?? []) as unknown as TestRow[]) {
      testMap.set(t.id, t);
    }

    const emailTests: OrderConfirmationTest[] = payload.assignments.map(
      (a) => {
        const t = testMap.get(a.test_id);
        const lab = Array.isArray(t?.lab) ? t?.lab[0] : t?.lab;
        const fasting = /fasting/i.test(t?.turnaround_display ?? "");
        return {
          name: t?.name ?? "Unknown test",
          lab: lab?.name ?? "",
          price_cad: a.unit_price_cad,
          requires_fasting: fasting,
        };
      }
    );

    const portalUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
    const orderIdShort = orderId.slice(0, 8).toUpperCase();

    const promoCode = payload.promo_code ?? null;
    // AVOVITA-TEST is the only supported coupon today and applies 100% off
    // (handled in the Stripe checkout route). When set, the entire payload
    // total is the discount amount.
    const promoDiscount = promoCode ? payload.total : 0;

    const html = renderOrderConfirmationEmail({
      firstName,
      orderIdShort,
      tests: emailTests,
      subtotal: payload.subtotal,
      discountTotal: payload.discount_cad ?? 0,
      visitFeeBase: payload.visit_fees.base,
      visitFeeAdditional:
        payload.visit_fees.additional_per_person *
        payload.visit_fees.additional_count,
      visitFeeTotal: payload.visit_fees.total,
      total: payload.total,
      portalUrl,
      stripeSessionId,
      promoCode,
      promoDiscount,
      confirmationLink: confirmationLink ?? null,
    });

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_ORDERS!,
        to: account.email,
        subject: orderConfirmationSubject(orderIdShort),
        html,
      });
      await logNotification(supabase, {
        channel: "email",
        template: "order_confirmation",
        recipient: account.email,
        status: "sent",
        account_id: accountId,
        order_id: orderId,
      });
    } catch (sendErr) {
      console.error(
        `[checkout] Resend failed for order_confirmation ${orderId}:`,
        sendErr
      );
      await logNotification(supabase, {
        channel: "email",
        template: "order_confirmation",
        recipient: account.email,
        status: "failed",
        account_id: accountId,
        order_id: orderId,
        error_message: String(sendErr),
      });
    }
  } catch (err) {
    console.error(
      `[checkout] Failed to build confirmation email for ${orderId}:`,
      err
    );
  }
}

/**
 * Sends the order confirmation email for GUEST checkouts immediately
 * on webhook receipt, using the Stripe session email directly.
 * Does NOT require an account to exist in Supabase yet.
 * The complete-purchase route will ALSO send the full confirmation
 * after account creation — this is a safety net so the customer
 * always gets notified even if they close the tab.
 */
export async function sendGuestOrderConfirmationEmail(
  supabase: ServiceClient,
  orderId: string,
  payload: OrderMetadataPayload,
  customerEmail: string,
  stripeSessionId?: string
): Promise<void> {
  try {
    const accountHolder = payload.persons.find((p) => p.is_account_holder);
    const firstName = accountHolder?.first_name || "there";

    const testIds = [...new Set(payload.assignments.map((a) => a.test_id))];
    const { data: testsRaw } = await supabase
      .from("tests")
      .select("id, name, turnaround_display, lab:labs(name)")
      .in("id", testIds);

    type TestRow = {
      id: string;
      name: string;
      turnaround_display: string | null;
      lab: { name: string } | { name: string }[] | null;
    };
    const testMap = new Map<string, TestRow>();
    for (const t of (testsRaw ?? []) as unknown as TestRow[]) {
      testMap.set(t.id, t);
    }

    const emailTests: OrderConfirmationTest[] = payload.assignments.map(
      (a) => {
        const t = testMap.get(a.test_id);
        const lab = Array.isArray(t?.lab) ? t?.lab[0] : t?.lab;
        const fasting = /fasting/i.test(t?.turnaround_display ?? "");
        return {
          name: t?.name ?? "Unknown test",
          lab: lab?.name ?? "",
          price_cad: a.unit_price_cad,
          requires_fasting: fasting,
        };
      }
    );

    const portalUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
    const orderIdShort = orderId.slice(0, 8).toUpperCase();

    const promoCode = payload.promo_code ?? null;
    // AVOVITA-TEST is the only supported coupon today and applies 100% off
    // (handled in the Stripe checkout route). When set, the entire payload
    // total is the discount amount.
    const promoDiscount = promoCode ? payload.total : 0;

    const html = renderOrderConfirmationEmail({
      firstName,
      orderIdShort,
      tests: emailTests,
      subtotal: payload.subtotal,
      discountTotal: payload.discount_cad ?? 0,
      visitFeeBase: payload.visit_fees.base,
      visitFeeAdditional:
        payload.visit_fees.additional_per_person *
        payload.visit_fees.additional_count,
      visitFeeTotal: payload.visit_fees.total,
      total: payload.total,
      portalUrl,
      stripeSessionId,
      promoCode,
      promoDiscount,
    });

    console.log(`[checkout] attempting email to ${customerEmail}`);
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_ORDERS!,
        to: customerEmail,
        subject: orderConfirmationSubject(orderIdShort),
        html,
      });
      console.log(`[checkout] email sent successfully to ${customerEmail}`);
      await logNotification(supabase, {
        channel: "email",
        template: "order_confirmation_guest",
        recipient: customerEmail,
        status: "sent",
        order_id: orderId,
      });
    } catch (sendErr) {
      console.error(
        `[checkout] Resend failed for guest ${customerEmail}:`,
        sendErr
      );
      await logNotification(supabase, {
        channel: "email",
        template: "order_confirmation_guest",
        recipient: customerEmail,
        status: "failed",
        order_id: orderId,
        error_message: String(sendErr),
      });
    }
  } catch (err) {
    console.error(
      `[checkout] email failed:`,
      JSON.stringify(err)
    );
    console.error(
      `[checkout] Failed to send guest confirmation email for ${orderId}:`,
      err
    );
  }
}
