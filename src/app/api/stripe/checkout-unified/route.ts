import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { computeDiscount } from "@/lib/checkout/discount";
import type { PendingOrderPayload } from "@/lib/checkout/pending-order";

/**
 * POST /api/stripe/checkout-unified
 *
 * Unified Stripe Checkout Session creation for all cart compositions
 * (tests + supplements + resources). Uses the pending_orders pattern:
 *
 *   1. Client creates a pending_order row with the full cart snapshot
 *   2. This route validates prices server-side, builds Stripe line items,
 *      and puts only { pending_order_id } in Stripe metadata
 *   3. Webhook fetches the pending_order to materialise order_lines
 *
 * The existing /api/stripe/checkout route remains untouched for pure
 * test-only carts (backwards compatibility during migration window).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pendingOrderId = body.pending_order_id as string | undefined;

    if (!pendingOrderId) {
      return NextResponse.json(
        { error: "pending_order_id is required" },
        { status: 400 },
      );
    }

    const service = createServiceRoleClient();

    // Fetch the pending order
    const { data: poRaw, error: poErr } = await service
      .from("pending_orders")
      .select("id, cart_snapshot, fulfilled_at")
      .eq("id", pendingOrderId)
      .single();

    if (poErr || !poRaw) {
      return NextResponse.json(
        { error: "Pending order not found" },
        { status: 404 },
      );
    }

    const po = poRaw as { id: string; cart_snapshot: PendingOrderPayload; fulfilled_at: string | null };
    if (po.fulfilled_at) {
      return NextResponse.json(
        { error: "This order has already been processed" },
        { status: 400 },
      );
    }

    const payload = po.cart_snapshot;

    // ─── Build Stripe line items ──────────────────────────────────

    // TODO(multi-province-tax): Currently applying flat 5% GST regardless of customer jurisdiction.
    // This under-collects for customers outside Alberta (e.g. Ontario HST 13%, BC 12%, Maritimes HST 15%).
    // When we expand physical shipping volume, migrate to Stripe Tax (automatic) for per-province
    // calculation. Business has acknowledged this simplification; AvoVita absorbs any tax delta
    // until migrated.
    const gstTaxRateId = process.env.STRIPE_GST_TAX_RATE_ID;

    type StripeLineItem = {
      price_data: {
        currency: string;
        product_data: { name: string; description?: string };
        unit_amount: number;
      };
      quantity: number;
      tax_rates?: string[];
    };
    const lineItems: StripeLineItem[] = [];



    // ── Test line items ─────────────────────────────────────────
    if (payload.has_tests && payload.test_assignments) {
      // Re-validate test prices server-side
      const testIds = [
        ...new Set(payload.test_assignments.map((a) => a.test_id)),
      ];
      const supabase = await createClient();
      const { data: testsRaw } = await supabase
        .from("tests")
        .select("id, name, price_cad, lab:labs(name)")
        .in("id", testIds)
        .eq("active", true);

      type TestRow = {
        id: string;
        name: string;
        price_cad: number;
        lab: { name: string } | { name: string }[] | null;
      };
      const testMap = new Map<string, TestRow>();
      for (const t of (testsRaw ?? []) as unknown as TestRow[]) {
        testMap.set(t.id, t);
      }

      for (const a of testIds) {
        if (!testMap.has(a)) {
          return NextResponse.json(
            { error: `Test ${a} is not available` },
            { status: 400 },
          );
        }
      }

      // Multi-test discount — ONLY for test lines
      const testDiscount = computeDiscount(payload.test_assignments.length);

      for (const assignment of payload.test_assignments) {
        const test = testMap.get(assignment.test_id)!;
        const person = payload.persons?.[assignment.person_index];
        const personName = person
          ? `${person.first_name} ${person.last_name}`.trim() ||
            `Person ${assignment.person_index + 1}`
          : "Patient";

        const lineReduction = testDiscount.applies
          ? Math.min(testDiscount.per_line, Number(test.price_cad))
          : 0;
        const effectivePrice = Number(test.price_cad) - lineReduction;

        lineItems.push({
          price_data: {
            currency: "cad",
            product_data: {
              name: test.name,
              description: testDiscount.applies
                ? `For: ${personName} · Multi-test discount −$${lineReduction.toFixed(2)}`
                : `For: ${personName}`,
            },
            unit_amount: Math.round(effectivePrice * 100),
          },
          quantity: 1,
        });
      }

      // Visit fee (only when tests are present)
      if (payload.visit_fees && payload.visit_fees.total > 0) {
        const city = payload.collection_address?.city ?? "Calgary";
        const personCount = payload.persons?.length ?? 1;
        const visitDescription =
          personCount === 1
            ? `In-home specimen collection — ${city}`
            : `In-home specimen collection (${personCount} people) — ${city}`;

        lineItems.push({
          price_data: {
            currency: "cad",
            product_data: {
              name: "FloLabs Home Visit Fee",
              description: visitDescription,
            },
            unit_amount: Math.round(payload.visit_fees.total * 100),
          },
          quantity: 1,
        });
      }
    }

    // ── Supplement line items ────────────────────────────────────
    if (payload.has_supplements) {
      const suppItems = payload.cart_items.filter(
        (i) => i.line_type === "supplement",
      );

      // Re-validate supplement prices server-side
      const suppIds = suppItems.map((i) =>
        i.line_type === "supplement" ? i.supplement_id : "",
      ).filter(Boolean);
      const { data: suppsRaw } = await service
        .from("supplements")
        .select("id, name, price_cad")
        .in("id", suppIds)
        .eq("active", true);

      const suppMap = new Map<string, { name: string; price_cad: number }>();
      for (const s of (suppsRaw ?? []) as Array<{
        id: string;
        name: string;
        price_cad: number;
      }>) {
        suppMap.set(s.id, { name: s.name, price_cad: Number(s.price_cad) });
      }

      for (const item of suppItems) {
        if (item.line_type !== "supplement") continue;
        const supp = suppMap.get(item.supplement_id);
        if (!supp) {
          return NextResponse.json(
            { error: `Supplement ${item.supplement_id} is not available` },
            { status: 400 },
          );
        }
        lineItems.push({
          price_data: {
            currency: "cad",
            product_data: {
              name: supp.name,
              description: "Supplement",
            },
            unit_amount: Math.round(supp.price_cad * 100),
          },
          quantity: item.quantity,
        });
      }

      // Supplement shipping fee
      if (
        payload.supplement_fulfillment === "shipping" &&
        (payload.supplement_shipping_fee_cad ?? 0) > 0
      ) {
        lineItems.push({
          price_data: {
            currency: "cad",
            product_data: {
              name: "Supplement Shipping",
              description: "Flat-rate Canada-wide delivery",
            },
            unit_amount: Math.round(
              (payload.supplement_shipping_fee_cad ?? 0) * 100,
            ),
          },
          quantity: 1,
        });
      }
    }

    // ── Resource line items ──────────────────────────────────────
    if (payload.has_resources) {
      const resItems = payload.cart_items.filter(
        (i) => i.line_type === "resource",
      );

      const resIds = resItems.map((i) =>
        i.line_type === "resource" ? i.resource_id : "",
      ).filter(Boolean);
      const { data: resRaw } = await service
        .from("resources")
        .select("id, title, price_cad")
        .in("id", resIds)
        .eq("active", true);

      const resMap = new Map<string, { title: string; price_cad: number }>();
      for (const r of (resRaw ?? []) as Array<{
        id: string;
        title: string;
        price_cad: number;
      }>) {
        resMap.set(r.id, { title: r.title, price_cad: Number(r.price_cad) });
      }

      for (const item of resItems) {
        if (item.line_type !== "resource") continue;
        const res = resMap.get(item.resource_id);
        if (!res) {
          return NextResponse.json(
            { error: `Resource ${item.resource_id} is not available` },
            { status: 400 },
          );
        }
        if (res.price_cad > 0) {
          lineItems.push({
            price_data: {
              currency: "cad",
              product_data: {
                name: res.title,
                description: "Digital resource",
              },
              unit_amount: Math.round(res.price_cad * 100),
            },
            quantity: 1,
          });
        }
      }
    }

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "No payable items in cart" },
        { status: 400 },
      );
    }

    // ─── Promo code (same logic as existing route) ───────────────
    const rawPromoCode = payload.promo_code?.trim() ?? "";
    if (rawPromoCode) {
      const { data: promoRow } = await service
        .from("promo_codes")
        .select("percent_off, amount_off, active, expires_at, org_id")
        .ilike("code", rawPromoCode)
        .maybeSingle();
      type PromoRow = {
        percent_off: number | null;
        amount_off: number | null;
        active: boolean;
        expires_at: string | null;
        org_id: string | null;
      };
      const row = promoRow as PromoRow | null;
      const isExpired =
        !!row?.expires_at && new Date(row.expires_at) <= new Date();
      const orgOk =
        !row?.org_id ||
        (payload.org_id !== null &&
          payload.org_id !== undefined &&
          payload.org_id === row.org_id);
      if (row?.active && !isExpired && orgOk) {
        const percentOff = row.percent_off ?? 0;
        const amountOffDollars =
          row.amount_off != null ? Number(row.amount_off) : 0;
        const preDiscountCents = lineItems.reduce(
          (s, li) => s + li.price_data.unit_amount * li.quantity,
          0,
        );
        let remainingDiscountCents =
          percentOff > 0
            ? Math.round(preDiscountCents * (percentOff / 100))
            : Math.round(amountOffDollars * 100);
        remainingDiscountCents = Math.min(
          remainingDiscountCents,
          preDiscountCents,
        );
        for (const li of lineItems) {
          if (remainingDiscountCents <= 0) break;
          const take = Math.min(
            li.price_data.unit_amount,
            remainingDiscountCents,
          );
          li.price_data.unit_amount -= take;
          remainingDiscountCents -= take;
          if (take > 0) {
            const suffix = ` · Promo ${rawPromoCode.toUpperCase()} −$${(take / 100).toFixed(2)}`;
            li.price_data.product_data.description =
              (li.price_data.product_data.description ?? "") + suffix;
          }
        }
      }
    }

    // Apply GST tax rate to all line items
    if (gstTaxRateId) {
      for (const li of lineItems) {
        li.tax_rates = [gstTaxRateId];
      }
    }

    // ─── Resolve customer email for Stripe ────────────────────────
    let customerEmail: string | undefined;
    if (payload.account_user_id) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) customerEmail = user.email;
    }
    if (!customerEmail && payload.representative?.email) {
      customerEmail = payload.representative.email.trim().toLowerCase();
    }
    if (!customerEmail && payload.contact_email) {
      customerEmail = payload.contact_email.trim().toLowerCase();
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";

    // ─── Create Stripe Checkout Session ───────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "cad",
      line_items: lineItems,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout`,
      customer_email: customerEmail,
      metadata: {
        version: "2",
        pending_order_id: pendingOrderId,
        account_user_id: payload.account_user_id ?? "",
      },
      payment_intent_data: {
        metadata: {
          version: "2",
          pending_order_id: pendingOrderId,
          account_user_id: payload.account_user_id ?? "",
        },
      },
    });

    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error("[stripe-checkout-unified] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create checkout session",
      },
      { status: 500 },
    );
  }
}
