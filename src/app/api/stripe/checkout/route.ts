import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { calculateVisitFees } from "@/lib/utils";
import type { PatientProfile, Lab } from "@/types/database";

interface CartRequestItem {
  test_id: string;
  profile_id: string;
  quantity: number;
}

type TestRecord = {
  id: string;
  name: string;
  price_cad: number;
  turnaround_display: string | null;
  lab_id: string;
};

type LabRecord = {
  id: string;
  name: string;
  cross_border_country: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const cartItems: CartRequestItem[] = body.items;

    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const testIds = [...new Set(cartItems.map((item) => item.test_id))];
    const { data: testsRaw, error: testsError } = await supabase
      .from("tests")
      .select("id, name, price_cad, turnaround_display, lab_id")
      .in("id", testIds)
      .eq("active", true);

    if (testsError || !testsRaw) {
      return NextResponse.json({ error: "Failed to fetch tests" }, { status: 500 });
    }
    const tests = testsRaw as unknown as TestRecord[];

    const testMap = new Map(tests.map((t) => [t.id, t]));

    for (const item of cartItems) {
      if (!testMap.has(item.test_id)) {
        return NextResponse.json(
          { error: `Test ${item.test_id} not found or inactive` },
          { status: 400 }
        );
      }
    }

    const profileIds = [...new Set(cartItems.map((item) => item.profile_id))];
    const { data: profilesRaw, error: profilesError } = await supabase
      .from("patient_profiles")
      .select("*")
      .in("id", profileIds)
      .eq("account_id", user.id);

    if (profilesError || !profilesRaw) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }
    const profiles = profilesRaw as unknown as PatientProfile[];

    const { data: labsRaw } = await supabase
      .from("labs")
      .select("id, name, cross_border_country")
      .in("id", tests.map((t) => t.lab_id));
    const labs = (labsRaw ?? []) as unknown as LabRecord[];
    const labMap = new Map(labs.map((l) => [l.id, l]));

    // Build enriched cart for fee calculation (minimal shape)
    const enrichedCart = cartItems.map((item) => {
      const test = testMap.get(item.test_id)!;
      const lab = labMap.get(test.lab_id) ?? { id: test.lab_id, name: "", cross_border_country: null };
      return {
        test: {
          id: test.id,
          name: test.name,
          price_cad: test.price_cad,
          lab_id: test.lab_id,
          lab: {
            id: lab.id,
            name: lab.name,
            country: "",
            shipping_schedule: "same_day" as const,
            shipping_notes: null,
            results_visibility: "full" as const,
            turnaround_min_days: null,
            turnaround_max_days: null,
            turnaround_notes: null,
            cross_border_country: lab.cross_border_country,
            created_at: "",
          } satisfies Lab,
          slug: "",
          description: null,
          category: null,
          turnaround_display: test.turnaround_display,
          turnaround_min_days: null,
          turnaround_max_days: null,
          turnaround_note: null,
          specimen_type: null,
          order_type: "standard" as const,
          stability_notes: null,
          active: true,
          featured: false,
          created_at: "",
          updated_at: "",
        },
        profile_id: item.profile_id,
        quantity: item.quantity,
      };
    });

    const visitFeeBreakdowns = calculateVisitFees(enrichedCart, profiles);
    const totalVisitFees = visitFeeBreakdowns.reduce((sum, b) => sum + b.total_fee, 0);

    // Build Stripe line items (using plain object literal — no imported type needed)
    type StripeLineItem = {
      price_data: {
        currency: string;
        product_data: { name: string; description?: string };
        unit_amount: number;
      };
      quantity: number;
    };
    const lineItems: StripeLineItem[] = [];

    for (const item of cartItems) {
      const test = testMap.get(item.test_id)!;
      const profile = profiles.find((p) => p.id === item.profile_id);
      const profileName = profile
        ? `${profile.first_name} ${profile.last_name}`
        : "Patient";

      lineItems.push({
        price_data: {
          currency: "cad",
          product_data: {
            name: test.name,
            description: `For: ${profileName}`,
          },
          unit_amount: Math.round(test.price_cad * 100),
        },
        quantity: item.quantity,
      });
    }

    for (const breakdown of visitFeeBreakdowns) {
      const description =
        breakdown.person_count === 1
          ? `In-home specimen collection — ${breakdown.address_label}`
          : `In-home specimen collection (${breakdown.person_count} people) — ${breakdown.address_label}`;

      lineItems.push({
        price_data: {
          currency: "cad",
          product_data: {
            name: "FloLabs Home Visit Fee",
            description,
          },
          unit_amount: Math.round(breakdown.total_fee * 100),
        },
        quantity: 1,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "cad",
      line_items: lineItems,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/tests`,
      customer_email: user.email ?? undefined,
      metadata: {
        user_id: user.id,
        cart_items: JSON.stringify(
          cartItems.map((item) => ({
            test_id: item.test_id,
            profile_id: item.profile_id,
            quantity: item.quantity,
            unit_price_cad: testMap.get(item.test_id)!.price_cad,
          }))
        ),
        visit_fee_total: totalVisitFees.toString(),
        subtotal: cartItems
          .reduce(
            (sum, item) =>
              sum + (testMap.get(item.test_id)?.price_cad ?? 0) * item.quantity,
            0
          )
          .toString(),
      },
      payment_intent_data: {
        metadata: { user_id: user.id },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
