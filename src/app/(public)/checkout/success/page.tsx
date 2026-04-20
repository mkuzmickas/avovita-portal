import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { reassembleMetadata } from "@/lib/checkout/materialise";
import { CheckoutSuccessV2 } from "@/components/checkout/CheckoutSuccessV2";
import { ClearCartOnMount } from "@/components/checkout/ClearCartOnMount";
import { findStabilityConstrainedTests } from "@/lib/checkout/stability";
import type { PendingOrderPayload } from "@/lib/checkout/pending-order";

export const dynamic = "force-dynamic";

const ACUITY_URL =
  process.env.NEXT_PUBLIC_ACUITY_EMBED_URL ??
  "https://flolabsbooking.as.me/?appointmentType=84416067";

interface SearchParams {
  session_id?: string;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id;
  if (!sessionId) redirect("/tests");

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    redirect("/tests");
  }
  if (session.payment_status !== "paid") redirect("/tests");

  const metadata = session.metadata as Record<string, string> | null;
  const service = createServiceRoleClient();

  // ─── Determine version and load payload ─────────────────────────
  let pendingPayload: PendingOrderPayload | null = null;
  const v1Payload = reassembleMetadata(metadata);

  if (metadata?.version === "2" && metadata?.pending_order_id) {
    const { data: poRaw } = await service
      .from("pending_orders")
      .select("cart_snapshot")
      .eq("id", metadata.pending_order_id)
      .single();
    if (poRaw) {
      pendingPayload = (poRaw as { cart_snapshot: PendingOrderPayload }).cart_snapshot;
    }
  }

  // Neither version resolved — redirect
  if (!v1Payload && !pendingPayload) redirect("/tests");

  // Cart composition (v2) or defaults (v1 = tests only)
  const hasTests = pendingPayload?.has_tests ?? true;
  const hasSupplements = pendingPayload?.has_supplements ?? false;
  const hasResources = pendingPayload?.has_resources ?? false;

  // ─── Resolve order + account email + waiver state ───────────────
  const { data: orderRaw } = await service
    .from("orders")
    .select(
      `id, total_cad, account_id, org_id,
       account:accounts(email, waiver_completed),
       org:organizations(waiver_addendum, waiver_addendum_title)`
    )
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  type OrgBlock = {
    waiver_addendum: string | null;
    waiver_addendum_title: string | null;
  };
  const order = orderRaw as {
    id: string;
    total_cad: number | null;
    account_id: string | null;
    org_id: string | null;
    account:
      | { email: string | null; waiver_completed: boolean }
      | { email: string | null; waiver_completed: boolean }[]
      | null;
    org: OrgBlock | OrgBlock[] | null;
  } | null;
  const orgBlock = Array.isArray(order?.org) ? order?.org[0] : order?.org;
  const waiverAddendum = orgBlock?.waiver_addendum ?? null;
  const waiverAddendumTitle = orgBlock?.waiver_addendum_title ?? null;

  const accountObj = Array.isArray(order?.account)
    ? order?.account[0]
    : order?.account;
  const accountEmail =
    accountObj?.email ??
    (v1Payload?.representative?.email) ??
    pendingPayload?.contact_email ??
    session.customer_email ??
    session.customer_details?.email ??
    "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let initialWaiverDone = accountObj?.waiver_completed ?? false;
  if (!initialWaiverDone && user) {
    const { data: row } = await service
      .from("accounts")
      .select("waiver_completed")
      .eq("id", user.id)
      .maybeSingle();
    initialWaiverDone =
      (row as { waiver_completed: boolean } | null)?.waiver_completed ??
      false;
  }

  const orderIdShort = order
    ? order.id.slice(0, 8).toUpperCase()
    : sessionId.slice(-8).toUpperCase();
  const payloadTotal = pendingPayload?.total ?? v1Payload?.total ?? 0;
  const total =
    order?.total_cad ??
    (session.amount_total ?? Math.round(payloadTotal * 100)) / 100;

  // ─── Resolve item names for summary ─────────────────────────────
  const itemNames: string[] = [];

  // Test names + SKUs (from v1 or v2 payload)
  const testAssignments =
    pendingPayload?.test_assignments ?? v1Payload?.assignments ?? [];
  let stabilityConstrainedTests: string[] = [];
  if (testAssignments.length > 0) {
    const testIds = [
      ...new Set(testAssignments.map((a) => a.test_id)),
    ];
    const { data: testsRaw } = await service
      .from("tests")
      .select("id, name, sku, collection_method")
      .in("id", testIds);
    const testRows = (testsRaw ?? []) as Array<{
      id: string;
      name: string;
      sku: string | null;
      collection_method: string | null;
    }>;
    for (const t of testRows) {
      if (!itemNames.includes(t.name)) itemNames.push(t.name);
    }
    stabilityConstrainedTests = findStabilityConstrainedTests(testRows);
  }

  // Determine if order needs FloLabs phlebotomist booking.
  // Default true for v1 compat (all v1 orders have phlebotomist tests).
  let hasPhlebotomistTests = hasTests;
  let hasKitOnlyTests = false;
  if (testAssignments.length > 0) {
    const testIds = [...new Set(testAssignments.map((a) => a.test_id))];
    const { data: cmRows } = await service
      .from("tests")
      .select("collection_method")
      .in("id", testIds);
    const methods = ((cmRows ?? []) as Array<{ collection_method: string | null }>)
      .map((r) => r.collection_method ?? "phlebotomist_draw");
    hasPhlebotomistTests = methods.some((m) => m === "phlebotomist_draw");
    hasKitOnlyTests = !hasPhlebotomistTests;
  }

  // Supplement names
  if (pendingPayload?.has_supplements) {
    for (const item of pendingPayload.cart_items) {
      if (item.line_type === "supplement" && !itemNames.includes(item.name)) {
        itemNames.push(item.name);
      }
    }
  }

  // Resource names
  if (pendingPayload?.has_resources) {
    for (const item of pendingPayload.cart_items) {
      if (item.line_type === "resource" && !itemNames.includes(item.name)) {
        itemNames.push(item.name);
      }
    }
  }

  const rep =
    pendingPayload?.representative ?? v1Payload?.representative ?? null;
  const isRepresentative = !!rep;
  const persons = pendingPayload?.persons ?? v1Payload?.persons ?? [];
  const dependents = isRepresentative
    ? persons.map((p) => ({
        first_name: p.first_name,
        last_name: p.last_name,
      }))
    : [];

  // Supplement delivery info for success page
  const supplementFulfillment =
    pendingPayload?.supplement_fulfillment ?? null;
  const supplementShippingAddress =
    pendingPayload?.supplement_shipping_address ?? null;

  return (
    <>
      <ClearCartOnMount />
      <CheckoutSuccessV2
        sessionId={sessionId}
        email={accountEmail}
        orderIdShort={orderIdShort}
        total={total}
        itemNames={itemNames}
        isRepresentative={isRepresentative}
        dependents={dependents}
        representativeRelationship={rep?.relationship ?? null}
        acuityUrl={ACUITY_URL}
        initialWaiverDone={initialWaiverDone}
        waiverAddendum={waiverAddendum}
        waiverAddendumTitle={waiverAddendumTitle}
        // Composition flags for conditional sections
        hasTests={hasTests}
        hasSupplements={hasSupplements}
        hasResources={hasResources}
        stabilityConstrainedTests={stabilityConstrainedTests}
        orderId={order?.id ?? null}
        hasKitOnlyTests={hasKitOnlyTests}
        supplementFulfillment={supplementFulfillment}
        supplementShippingAddress={supplementShippingAddress}
      />
    </>
  );
}
