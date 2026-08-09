import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { OrderMetadataPayload } from "@/lib/checkout/materialise";

export const runtime = "nodejs";

const FLOLABS_NOTIFICATIONS_ENABLED =
  process.env.FLOLABS_NOTIFICATIONS_ENABLED === "true";

/**
 * POST /api/checkout/complete-profile
 *
 * Called from PostPurchaseOnboarding after the customer finishes
 * filling in ProfileForm for every person on the order. Since the
 * Aug 2026 checkout simplification, identity fields (first_name /
 * last_name / date_of_birth / biological_sex) are captured here
 * rather than pre-payment — so the webhook can't send the FloLabs
 * requisition email at payment time (patient fields are NULL). This
 * endpoint fires the requisition once every patient_profile linked
 * to the order has complete data.
 *
 * Idempotent: relies on FloLabs requisition email's own dedup guard
 * (the `notifications` table row keyed by (order_id, kind)). Calling
 * this twice for the same order is safe.
 *
 * Auth: current session must own the order. Returns 401 for
 * unauthenticated callers, 403 for wrong owner, 404 for missing.
 */
export async function POST(request: NextRequest) {
  let body: { order_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const orderId = body.order_id?.trim();
  if (!orderId) {
    return NextResponse.json(
      { error: "order_id is required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createServiceRoleClient();

  // ─── Load order + verify ownership ──────────────────────────────
  const { data: orderRaw, error: orderErr } = await service
    .from("orders")
    .select("id, account_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) {
    console.error("[complete-profile] Failed to load order:", orderErr.message);
    return NextResponse.json({ error: "Order lookup failed" }, { status: 500 });
  }
  const order = orderRaw as { id: string; account_id: string } | null;
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.account_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ─── Load profiles linked to the account ───────────────────────
  // Every profile row on this account participates in the order
  // (single-order-per-checkout invariant); assign a stable person_index
  // from created_at so downstream FloLabs requisition can group by
  // person consistently.
  const { data: profilesRaw, error: profilesErr } = await service
    .from("patient_profiles")
    .select(
      "id, first_name, last_name, date_of_birth, biological_sex, phone, is_primary, is_dependent, relationship",
    )
    .eq("account_id", order.account_id)
    .order("created_at", { ascending: true });
  if (profilesErr) {
    console.error(
      "[complete-profile] Failed to load profiles:",
      profilesErr.message,
    );
    return NextResponse.json({ error: "Profile lookup failed" }, { status: 500 });
  }
  type Profile = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    date_of_birth: string | null;
    biological_sex: "male" | "female" | "intersex" | null;
    phone: string | null;
    is_primary: boolean;
    is_dependent: boolean;
    relationship: string | null;
  };
  const profiles = (profilesRaw ?? []) as unknown as Profile[];

  // ─── Verify every profile is complete ──────────────────────────
  const incomplete = profiles.filter(
    (p) =>
      !p.first_name?.trim() ||
      !p.last_name?.trim() ||
      !p.date_of_birth?.trim() ||
      !p.biological_sex,
  );
  if (incomplete.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: "profile_incomplete",
        incomplete_profile_ids: incomplete.map((p) => p.id),
      },
      { status: 200 },
    );
  }

  // ─── Load order_lines + visit_group to reconstruct payload ─────
  const { data: linesRaw } = await service
    .from("order_lines")
    .select("test_id, profile_id, unit_price_cad")
    .eq("order_id", orderId);
  type Line = {
    test_id: string;
    profile_id: string;
    unit_price_cad: number;
  };
  const lines = (linesRaw ?? []) as unknown as Line[];

  const { data: visitGroupRaw } = await service
    .from("visit_groups")
    .select(
      "address_line1, address_line2, city, province, postal_code, base_fee_cad, additional_fee_per_person_cad, additional_person_count",
    )
    .eq("order_id", orderId)
    .maybeSingle();
  type VisitGroup = {
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    base_fee_cad: number | null;
    additional_fee_per_person_cad: number | null;
    additional_person_count: number | null;
  };
  const vg = visitGroupRaw as VisitGroup | null;

  // ─── Reconstruct payload for sendFloLabsRequisition ────────────
  const profileIdToIndex = new Map<string, number>();
  profiles.forEach((p, idx) => profileIdToIndex.set(p.id, idx));

  const payload: OrderMetadataPayload = {
    version: 1,
    account_user_id: order.account_id,
    collection_address: {
      address_line1: vg?.address_line1 ?? "",
      address_line2: vg?.address_line2 ?? "",
      city: vg?.city ?? "",
      province: vg?.province ?? "AB",
      postal_code: vg?.postal_code ?? "",
    },
    persons: profiles.map((p, idx) => ({
      index: idx,
      is_account_holder: !!p.is_primary,
      first_name: p.first_name!,
      last_name: p.last_name!,
      date_of_birth: p.date_of_birth!,
      biological_sex: p.biological_sex!,
      phone: p.phone ?? null,
      relationship: p.relationship,
    })),
    assignments: lines.map((l) => ({
      test_id: l.test_id,
      person_index: profileIdToIndex.get(l.profile_id) ?? 0,
      unit_price_cad: l.unit_price_cad,
    })),
    visit_fees: {
      base: vg?.base_fee_cad ?? 0,
      additional_per_person: vg?.additional_fee_per_person_cad ?? 0,
      additional_count: vg?.additional_person_count ?? 0,
      total:
        (vg?.base_fee_cad ?? 0) +
        (vg?.additional_fee_per_person_cad ?? 0) *
          (vg?.additional_person_count ?? 0),
    },
    subtotal: 0,
    discount_cad: 0,
    total: 0,
    representative: null,
  };

  // ─── Fire FloLabs requisition ──────────────────────────────────
  if (!FLOLABS_NOTIFICATIONS_ENABLED) {
    return NextResponse.json({
      ok: true,
      floLabs_sent: false,
      reason: "notifications_disabled",
    });
  }

  try {
    const { sendFloLabsRequisition } = await import(
      "@/lib/emails/floLabsRequisition"
    );
    await sendFloLabsRequisition(service, orderId, payload);
    return NextResponse.json({ ok: true, floLabs_sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[complete-profile] FloLabs requisition failed for order ${orderId}:`,
      message,
    );
    return NextResponse.json(
      { ok: false, reason: "flolabs_send_failed", error: message },
      { status: 500 },
    );
  }
}
