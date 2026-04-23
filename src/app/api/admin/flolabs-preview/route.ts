import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendFloLabsRequisition } from "@/lib/emails/floLabsRequisition";
import type { OrderMetadataPayload } from "@/lib/checkout/materialise";

export const runtime = "nodejs";

/**
 * POST /api/admin/flolabs-preview
 *
 * One-shot admin route that sends the FloLabs requisition email to an
 * arbitrary address (default: mike's personal inbox) using real test
 * rows looked up by SKU. Lets Mike eyeball the rendered email during
 * the manual catalogue backfill without creating a fake order.
 *
 * Body: { sku1: string; sku2?: string; to?: string }
 *  - sku1 / sku2: test SKUs to include (case-insensitive). Omit sku2
 *    for a single-test preview.
 *  - to: recipient override. Defaults to m_kuzmickas@hotmail.com.
 *
 * Production paths are unchanged — the webhook that sends to FloLabs
 * still passes no options and hits info@flolabs.ca with a real order.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: accRow } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (accRow as { role: string } | null)?.role ?? null;
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden — admin only" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    sku1?: string;
    sku2?: string;
    to?: string;
  };
  const sku1 = body.sku1?.trim();
  const sku2 = body.sku2?.trim();
  const toAddress = body.to?.trim() || "m_kuzmickas@hotmail.com";
  if (!sku1) {
    return NextResponse.json(
      { error: "sku1 is required (at least one SKU to render)" },
      { status: 400 }
    );
  }

  const service = createServiceRoleClient();
  const skusToFetch = [sku1, ...(sku2 ? [sku2] : [])];
  const { data: testsRaw, error: testsErr } = await service
    .from("tests")
    .select("id, sku, name")
    .in("sku", skusToFetch);
  if (testsErr) {
    return NextResponse.json(
      { error: `Supabase test lookup failed: ${testsErr.message}` },
      { status: 500 }
    );
  }
  const tests = (testsRaw ?? []) as Array<{
    id: string;
    sku: string | null;
    name: string;
  }>;
  if (tests.length === 0) {
    return NextResponse.json(
      { error: `No tests matched SKUs: ${skusToFetch.join(", ")}` },
      { status: 404 }
    );
  }

  // Synthesise a minimal payload — one account-holder person, both
  // tests assigned to them, a placeholder address. sendFloLabsRequisition
  // re-fetches the full test rows itself so we only need IDs here.
  const payload: OrderMetadataPayload = {
    version: 1,
    persons: [
      {
        index: 0,
        is_account_holder: true,
        first_name: "Preview",
        last_name: "Test",
        date_of_birth: "1990-01-01",
        biological_sex: "male",
        phone: "+1-403-555-0100",
        own_account_email: toAddress,
        relationship: "account_holder",
      },
    ],
    assignments: tests.map((t) => ({
      test_id: t.id,
      person_index: 0,
      unit_price_cad: 0,
    })),
    collection_address: {
      address_line1: "1234 Preview Ave NW",
      address_line2: "",
      city: "Calgary",
      province: "AB",
      postal_code: "T2N 1N4",
    },
    visit_fees: {
      base: 85,
      additional_per_person: 0,
      additional_count: 0,
      total: 85,
    },
    subtotal: 0,
    discount_cad: 0,
    total: 85,
    account_user_id: user.id,
    representative: null,
  };

  try {
    // Synthetic order id — eight-char hex. sendFloLabsRequisition uses
    // orderId only for the subject line and notifications row (which we
    // skip via skipNotificationLog).
    const previewOrderId = `preview-${Date.now().toString(36)}`;
    await sendFloLabsRequisition(service, previewOrderId, payload, {
      toOverride: toAddress,
      subjectPrefix: "[PREVIEW] ",
      skipNotificationLog: true,
    });
    return NextResponse.json({
      sent: true,
      to: toAddress,
      tests_rendered: tests.map((t) => ({ sku: t.sku, name: t.name })),
    });
  } catch (err) {
    console.error("[flolabs-preview] send failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 }
    );
  }
}
