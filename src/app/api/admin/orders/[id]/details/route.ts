import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: acc } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!acc || (acc as { role: string }).role !== "admin") return null;
  return user;
}

/**
 * GET /api/admin/orders/[id]/details
 *
 * Returns full order details for the expanded row view:
 * order fields, order_lines with joined product + profile data,
 * visit_groups with collection address + fee breakdown.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const service = createServiceRoleClient();

  // Order with all fields needed for the expanded panel
  const { data: orderRaw, error: orderErr } = await service
    .from("orders")
    .select(
      `
      id, status, subtotal_cad, discount_cad, additional_discount_cad,
      home_visit_fee_cad, tax_cad, total_cad, notes,
      stripe_payment_intent_id,
      stripe_session_id, has_supplements, supplement_fulfillment,
      supplement_shipping_fee_cad, supplement_shipping_address,
      fedex_tracking_number, shipped_at, appointment_date,
      created_at,
      account:accounts(id, email)
    `,
    )
    .eq("id", id)
    .single();

  if (orderErr || !orderRaw) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Order lines with product + profile joins. `collection_method`
  // is pulled so the panel can recompute the kit service fee
  // (Stripe collects it but it isn't a persisted order column).
  const { data: linesRaw } = await service
    .from("order_lines")
    .select(
      `
      id, line_type, test_id, supplement_id, resource_id,
      profile_id, quantity, unit_price_cad,
      custom_description, custom_notes,
      test:tests(name, sku, collection_method),
      supplement:supplements(name, sku),
      resource:resources(title),
      profile:patient_profiles(first_name, last_name)
    `,
    )
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  // Visit groups (collection address + fee breakdown)
  const { data: visitGroupsRaw } = await service
    .from("visit_groups")
    .select(
      `
      id, address_line1, address_line2, city, province, postal_code,
      base_fee_cad, additional_person_count, additional_fee_cad, total_fee_cad
    `,
    )
    .eq("order_id", id);

  // Normalize Supabase join arrays to single objects
  type Line = {
    id: string;
    line_type: string;
    test_id: string | null;
    supplement_id: string | null;
    resource_id: string | null;
    profile_id: string | null;
    quantity: number;
    unit_price_cad: number;
    test: {
      name: string;
      sku: string | null;
      collection_method: "phlebotomist_draw" | "self_collected_kit" | null;
    } | null;
    supplement: { name: string; sku: string | null } | null;
    resource: { title: string } | null;
    profile: { first_name: string; last_name: string } | null;
  };

  const lines = ((linesRaw ?? []) as unknown as Array<Record<string, unknown>>).map(
    (l) => {
      const normalize = (v: unknown) =>
        Array.isArray(v) ? v[0] ?? null : v ?? null;
      return {
        id: l.id,
        line_type: l.line_type,
        test_id: l.test_id,
        supplement_id: l.supplement_id,
        resource_id: l.resource_id,
        profile_id: l.profile_id,
        quantity: l.quantity,
        unit_price_cad: l.unit_price_cad,
        custom_description: l.custom_description ?? null,
        custom_notes: l.custom_notes ?? null,
        test: normalize(l.test),
        supplement: normalize(l.supplement),
        resource: normalize(l.resource),
        profile: normalize(l.profile),
      } as Line;
    },
  );

  // Sort: tests first, supplements second, resources third
  const typeOrder: Record<string, number> = { test: 0, supplement: 1, resource: 2 };
  lines.sort(
    (a, b) => (typeOrder[a.line_type] ?? 9) - (typeOrder[b.line_type] ?? 9),
  );

  // Products-order fallback. When an order was auto-created from a
  // paid Stripe invoice (order_type='products') AND the webhook was
  // unable to mirror the invoice's line items onto order_lines (early
  // versions of the webhook skipped the mirror when the invoice had
  // no profile_id — orders like #CE1A6C4F ended up with 0 order_lines
  // even though $354 of stuff was paid for), render from
  // invoice_line_items via the invoice link. This makes the admin
  // panel show the same items the customer paid for without needing
  // a backfill.
  if (lines.length === 0) {
    const { data: invoiceRow } = await service
      .from("invoices")
      .select("id, invoice_number")
      .eq("order_id", id)
      .maybeSingle();
    const invoice = invoiceRow as {
      id: string;
      invoice_number: string;
    } | null;
    if (invoice) {
      const { data: invoiceLinesRaw } = await service
        .from("invoice_line_items")
        .select(
          `line_type, test_id, supplement_id, description,
           quantity, unit_price_cad, line_total_cad, sort_order,
           test:tests(name, sku, collection_method),
           supplement:supplements(name, sku)`,
        )
        .eq("invoice_id", invoice.id)
        .order("sort_order", { ascending: true });
      const invoiceLines = (
        (invoiceLinesRaw ?? []) as unknown as Array<Record<string, unknown>>
      ).map((l, i) => {
        const normalize = (v: unknown) =>
          Array.isArray(v) ? v[0] ?? null : v ?? null;
        return {
          id: `invoice-${invoice.id}-${i}`,
          line_type:
            l.line_type === "test" || l.line_type === "supplement"
              ? (l.line_type as string)
              : "resource",
          test_id: (l.test_id as string | null) ?? null,
          supplement_id: (l.supplement_id as string | null) ?? null,
          resource_id: null,
          profile_id: null,
          quantity: l.quantity as number,
          unit_price_cad: l.unit_price_cad as number,
          custom_description:
            l.line_type === "test" || l.line_type === "supplement"
              ? null
              : (l.description as string),
          custom_notes: null,
          test: normalize(l.test),
          supplement: normalize(l.supplement),
          resource: null,
          profile: null,
        } as Line;
      });
      // Discounts already fold into the order-level totals; skip
      // them here so we don't render a negative row twice.
      const nonDiscount = invoiceLines.filter(
        (l) => (l as unknown as { line_type: string }).line_type !== "discount",
      );
      lines.push(...nonDiscount);
      lines.sort(
        (a, b) =>
          (typeOrder[a.line_type] ?? 9) - (typeOrder[b.line_type] ?? 9),
      );
    }
  }

  const order = orderRaw as Record<string, unknown>;
  const account = Array.isArray(order.account)
    ? order.account[0]
    : order.account;

  // Check if stability disclaimer was acknowledged for this order
  const { data: stabilityEvent } = await service
    .from("analytics_events")
    .select("created_at")
    .eq("event_type", "stability_disclaimer_acknowledged")
    .contains("event_data", { order_id: id })
    .maybeSingle();

  return NextResponse.json({
    order: {
      ...order,
      account: account ?? null,
    },
    lines,
    visit_groups: visitGroupsRaw ?? [],
    stability_disclaimer: stabilityEvent
      ? { shown: true, acknowledged_at: (stabilityEvent as { created_at: string }).created_at }
      : { shown: false, acknowledged_at: null },
  });
}
