import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { reassembleMetadata } from "@/lib/checkout/materialise";
import { CheckoutSuccessV2 } from "@/components/checkout/CheckoutSuccessV2";
import { ClearCartOnMount } from "@/components/checkout/ClearCartOnMount";

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

  const payload = reassembleMetadata(
    session.metadata as Record<string, string> | null
  );
  if (!payload) redirect("/tests");

  const service = createServiceRoleClient();

  // Resolve order + account email + waiver state
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
    payload.representative?.email ??
    session.customer_email ??
    session.customer_details?.email ??
    "";

  // If a Supabase session already exists (returning user) we can read
  // their waiver state too.
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
  const total =
    order?.total_cad ??
    (session.amount_total ?? Math.round(payload.total * 100)) / 100;

  // Resolve test names for the order summary
  const testIds = [...new Set(payload.assignments.map((a) => a.test_id))];
  const { data: testsRaw } = await service
    .from("tests")
    .select("id, name")
    .in("id", testIds);
  const testNameById = new Map<string, string>();
  for (const t of (testsRaw ?? []) as Array<{ id: string; name: string }>) {
    testNameById.set(t.id, t.name);
  }
  const itemNames = [
    ...new Set(
      payload.assignments
        .map((a) => testNameById.get(a.test_id))
        .filter((n): n is string => !!n)
    ),
  ];

  const rep = payload.representative ?? null;
  const isRepresentative = !!rep;
  const dependents = isRepresentative
    ? payload.persons.map((p) => ({
        first_name: p.first_name,
        last_name: p.last_name,
      }))
    : [];

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
      />
    </>
  );
}
