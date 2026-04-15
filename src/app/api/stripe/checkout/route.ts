import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { computeDiscount } from "@/lib/checkout/discount";
import type { CheckoutPayload } from "@/lib/checkout/types";

/**
 * Multi-person checkout API. Accepts a CheckoutPayload built by the
 * client wizard, validates the test prices server-side against the
 * `tests` table (so the client can't tamper with them), creates a
 * Stripe Checkout Session with one line item per (test × person) pair
 * + one for the visit fee, and stuffs the full reconstruction data
 * into Stripe metadata for the webhook to materialise after payment.
 *
 * Stripe metadata constraints:
 *   - max 50 keys
 *   - each value max 500 characters
 * We split large JSON blobs across numbered chunks (`chunk_0`, `chunk_1`...)
 * and the webhook reassembles them.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckoutPayload;

    // ─── Basic validation ──────────────────────────────────────────
    if (!body.persons || body.persons.length === 0) {
      return NextResponse.json(
        { error: "At least one person is required" },
        { status: 400 }
      );
    }
    if (!body.assignments || body.assignments.length === 0) {
      return NextResponse.json(
        { error: "No tests assigned" },
        { status: 400 }
      );
    }
    if (
      !body.collection_address?.address_line1 ||
      !body.collection_address?.city ||
      !body.collection_address?.province ||
      !body.collection_address?.postal_code
    ) {
      return NextResponse.json(
        { error: "Collection address is incomplete" },
        { status: 400 }
      );
    }

    // Verify every person has at least one test
    const personIndices = new Set(body.persons.map((p) => p.index));
    const assignedPersonIndices = new Set(
      body.assignments.map((a) => a.assigned_to_person)
    );
    for (const idx of personIndices) {
      if (!assignedPersonIndices.has(idx)) {
        return NextResponse.json(
          { error: `Person ${idx + 1} has no tests assigned` },
          { status: 400 }
        );
      }
    }

    // Verify additional people consents
    for (const p of body.persons) {
      if (!p.is_account_holder && !p.consent_acknowledged) {
        return NextResponse.json(
          {
            error: `${p.first_name || "Additional person"} must consent to sharing the account`,
          },
          { status: 400 }
        );
      }
      if (!p.first_name || !p.last_name || !p.date_of_birth || !p.biological_sex) {
        return NextResponse.json(
          { error: `Person ${p.index + 1} has missing required fields` },
          { status: 400 }
        );
      }
      if (!p.is_account_holder && !p.relationship) {
        return NextResponse.json(
          { error: `Person ${p.index + 1} is missing a relationship` },
          { status: 400 }
        );
      }
    }

    // ─── Resolve tests server-side and verify prices ──────────────
    const supabase = await createClient();

    const testIds = [
      ...new Set(body.assignments.map((a) => a.test_id)),
    ];

    const { data: testsRaw, error: testsErr } = await supabase
      .from("tests")
      .select("id, name, price_cad, lab:labs(name)")
      .in("id", testIds)
      .eq("active", true);

    if (testsErr || !testsRaw) {
      return NextResponse.json(
        { error: "Failed to load tests" },
        { status: 500 }
      );
    }

    type TestRow = {
      id: string;
      name: string;
      price_cad: number;
      lab: { name: string } | { name: string }[] | null;
    };
    const tests = testsRaw as unknown as TestRow[];
    const testMap = new Map<
      string,
      { id: string; name: string; price_cad: number; lab_name: string }
    >();
    for (const t of tests) {
      const lab = Array.isArray(t.lab) ? t.lab[0] : t.lab;
      testMap.set(t.id, {
        id: t.id,
        name: t.name,
        price_cad: Number(t.price_cad),
        lab_name: lab?.name ?? "",
      });
    }

    // Reject any unknown / inactive tests
    for (const a of body.assignments) {
      if (!testMap.has(a.test_id)) {
        return NextResponse.json(
          { error: `Test ${a.test_id} is not available` },
          { status: 400 }
        );
      }
    }

    // ─── Compute discount (recomputed server-side — never trust client) ──
    // Multi-test discount: $20 off each order line when there are 2+ lines.
    //
    // Stripe Checkout Sessions do NOT support negative line items and we
    // were told not to use coupons or promotion codes, so the discount is
    // applied by reducing each test line's unit_amount at line-item
    // creation time. The test's product_data.description is annotated so
    // the discount is visible on Stripe's native checkout and receipt
    // pages, and our own branded confirmation email + portal UI show the
    // full breakdown with a dedicated "Multi-test discount" line.
    const discount = computeDiscount(body.assignments.length);

    // ─── Build Stripe line items ──────────────────────────────────
    type StripeLineItem = {
      price_data: {
        currency: string;
        product_data: { name: string; description?: string };
        unit_amount: number;
      };
      quantity: number;
    };
    const lineItems: StripeLineItem[] = [];

    let serverSubtotal = 0;
    let appliedDiscountTotal = 0;

    for (const assignment of body.assignments) {
      const test = testMap.get(assignment.test_id)!;
      const person = body.persons[assignment.assigned_to_person];
      const personName = person
        ? `${person.first_name} ${person.last_name}`.trim() ||
          `Person ${assignment.assigned_to_person + 1}`
        : "Patient";

      // Clamp reduction to the test's own price so unit_amount can never
      // go negative (Stripe rejects negative amounts).
      const lineReduction = discount.applies
        ? Math.min(discount.per_line, test.price_cad)
        : 0;
      const effectivePrice = test.price_cad - lineReduction;

      lineItems.push({
        price_data: {
          currency: "cad",
          product_data: {
            name: test.name,
            description: discount.applies
              ? `For: ${personName} · Multi-test discount −$${lineReduction.toFixed(2)}`
              : `For: ${personName}`,
          },
          unit_amount: Math.round(effectivePrice * 100),
        },
        quantity: 1,
      });

      serverSubtotal += test.price_cad;
      appliedDiscountTotal += lineReduction;
    }

    // Visit fee — zone-based pricing from the collection postal code.
    // Zone 1 (Calgary) = $85 base, Zone 2 (surrounding) = $134 base.
    // Unserved FSAs reject the request — the client-side gate should have
    // blocked them, but we re-validate here as the source of truth.
    const { classifyPostalZone } = await import("@/lib/checkout/visit-fees");
    const zone = classifyPostalZone(body.collection_address?.postal_code);
    if (zone === "unserved") {
      return NextResponse.json(
        {
          error:
            "Sorry, home collection is not currently available in your area. Please contact us at support@avovita.ca to discuss options.",
        },
        { status: 400 }
      );
    }
    const visitFeeBase =
      zone === "zone2"
        ? Number(process.env.NEXT_PUBLIC_HOME_VISIT_FEE_ZONE2 ?? 134)
        : Number(process.env.NEXT_PUBLIC_HOME_VISIT_FEE_BASE ?? 85);
    const visitFeeAdditional = Number(
      process.env.NEXT_PUBLIC_HOME_VISIT_FEE_ADDITIONAL ?? 55
    );
    const additionalCount = Math.max(0, body.persons.length - 1);
    const visitFeeTotal =
      visitFeeBase + additionalCount * visitFeeAdditional;

    const visitDescription =
      body.persons.length === 1
        ? `In-home specimen collection — ${body.collection_address.city}`
        : `In-home specimen collection (${body.persons.length} people) — ${body.collection_address.city}`;

    lineItems.push({
      price_data: {
        currency: "cad",
        product_data: {
          name: "FloLabs Home Visit Fee",
          description: visitDescription,
        },
        unit_amount: Math.round(visitFeeTotal * 100),
      },
      quantity: 1,
    });

    // ─── Build metadata payload ───────────────────────────────────
    // Resolve the org affinity (set by /org/[slug] persistence). Slug
    // → id is done server-side so the client can't forge an arbitrary
    // org_id. If the slug doesn't match an active org, we silently
    // drop it — the order just won't be tagged.
    let resolvedOrgId: string | null = null;
    if (typeof body.org_slug === "string" && body.org_slug.trim()) {
      const { getOrgIdBySlug } = await import("@/lib/org");
      resolvedOrgId = await getOrgIdBySlug(body.org_slug.trim());
    }

    // We serialise the order data into a single JSON string and split it
    // across numbered metadata keys (each ≤ 500 chars per Stripe limit).
    const orderPayload = {
      version: 1,
      account_user_id: body.account_user_id,
      collection_address: body.collection_address,
      persons: body.persons.map((p) => ({
        index: p.index,
        is_account_holder: p.is_account_holder,
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        date_of_birth: p.date_of_birth,
        biological_sex: p.biological_sex,
        relationship: p.relationship,
        phone: p.phone?.trim() || null,
        wants_own_account: p.wants_own_account ?? false,
        own_account_email: p.own_account_email?.trim() || null,
      })),
      assignments: body.assignments.map((a) => ({
        test_id: a.test_id,
        person_index: a.assigned_to_person,
        unit_price_cad: testMap.get(a.test_id)!.price_cad,
      })),
      visit_fees: {
        base: visitFeeBase,
        additional_per_person: visitFeeAdditional,
        additional_count: additionalCount,
        total: visitFeeTotal,
      },
      subtotal: serverSubtotal,
      discount_cad: appliedDiscountTotal,
      total: serverSubtotal - appliedDiscountTotal + visitFeeTotal,
      promo_code: body.promo_code?.trim().toUpperCase() || null,
      org_id: resolvedOrgId,
      representative: body.representative
        ? {
            first_name: body.representative.first_name.trim(),
            last_name: body.representative.last_name.trim(),
            email: body.representative.email.trim().toLowerCase(),
            phone: body.representative.phone.trim(),
            relationship: body.representative.relationship,
            poa_confirmed: !!body.representative.poa_confirmed,
          }
        : null,
    };

    const fullJson = JSON.stringify(orderPayload);
    const CHUNK_SIZE = 480; // Stripe metadata value limit is 500
    const chunks: string[] = [];
    for (let i = 0; i < fullJson.length; i += CHUNK_SIZE) {
      chunks.push(fullJson.slice(i, i + CHUNK_SIZE));
    }

    const metadata: Record<string, string> = {
      version: "1",
      chunk_count: chunks.length.toString(),
      account_user_id: body.account_user_id ?? "",
    };
    chunks.forEach((c, i) => {
      metadata[`chunk_${i}`] = c;
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";

    // ─── Resolve customer email for Stripe ─────────────────────────
    const accountHolder = body.persons.find((p) => p.is_account_holder);
    let customerEmail: string | undefined;
    if (body.account_user_id) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) customerEmail = user.email;
    }
    // Caregiver flow: pre-fill Stripe with the rep's email rather than
    // asking them for it again at checkout (the webhook uses the same
    // value to provision their account).
    if (!customerEmail && body.representative?.email) {
      customerEmail = body.representative.email.trim().toLowerCase();
    }
    void accountHolder; // We collect email at success-page time for guests

    // ─── Handle promo code ─────────────────────────────────────────
    // AVOVITA-TEST applies a one-time 100% off coupon.
    const promoCode = body.promo_code?.trim().toUpperCase();
    const applyTestDiscount = promoCode === "AVOVITA-TEST";

    let discounts:
      | Array<{ coupon: string }>
      | undefined;

    if (applyTestDiscount) {
      // Create a one-time 100% off coupon dynamically
      const coupon = await stripe.coupons.create({
        percent_off: 100,
        duration: "once",
        name: "AVOVITA-TEST (100% off)",
        max_redemptions: 1,
      });
      discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "cad",
      line_items: lineItems,
      ...(discounts ? { discounts } : {}),
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout`,
      customer_email: customerEmail,
      metadata,
      ...(discounts
        ? {}
        : {
            payment_intent_data: {
              metadata: {
                version: "1",
                account_user_id: body.account_user_id ?? "",
              },
            },
          }),
    });

    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error("[stripe-checkout] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create checkout session",
      },
      { status: 500 }
    );
  }
}
