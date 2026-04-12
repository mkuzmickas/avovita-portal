import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { reassembleMetadata } from "@/lib/checkout/materialise";
import {
  PostPurchaseOnboarding,
  type OnboardingSummary,
  type OnboardingPerson,
  type OnboardingAssignment,
} from "@/components/checkout/PostPurchaseOnboarding";

export const dynamic = "force-dynamic";

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

  // Verify Stripe session
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

  // Check auth state
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const alreadyLoggedIn = !!user;

  // Check if user has profile + waiver
  let hasProfile = false;
  let waiverDone = false;
  if (user) {
    const service = createServiceRoleClient();

    const [{ count: profileCount }, { data: accountRaw }] = await Promise.all([
      service
        .from("patient_profiles")
        .select("id", { count: "exact", head: true })
        .eq("account_id", user.id),
      service
        .from("accounts")
        .select("waiver_completed")
        .eq("id", user.id)
        .single(),
    ]);

    hasProfile = (profileCount ?? 0) > 0;
    waiverDone =
      (accountRaw as { waiver_completed: boolean } | null)
        ?.waiver_completed ?? false;
  }

  // Resolve order ID
  const service = createServiceRoleClient();
  const { data: orderRaw } = await service
    .from("orders")
    .select("id, total_cad")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  const order = orderRaw as { id: string; total_cad: number | null } | null;

  const orderIdShort = order
    ? order.id.slice(0, 8).toUpperCase()
    : sessionId.slice(-8).toUpperCase();
  const total =
    order?.total_cad ??
    (session.amount_total ?? Math.round(payload.total * 100)) / 100;

  // Resolve test details for fasting detection + specimen types
  const testIds = [
    ...new Set(payload.assignments.map((a) => a.test_id)),
  ];
  const { data: testsRaw } = await service
    .from("tests")
    .select("id, name, specimen_type, turnaround_display, lab:labs(name)")
    .in("id", testIds);

  type TestRow = {
    id: string;
    name: string;
    specimen_type: string | null;
    turnaround_display: string | null;
    lab: { name: string } | { name: string }[] | null;
  };
  const testMap = new Map<string, TestRow>();
  for (const t of (testsRaw ?? []) as unknown as TestRow[]) {
    testMap.set(t.id, t);
  }

  const persons: OnboardingPerson[] = payload.persons.map((p) => ({
    first_name: p.first_name,
    last_name: p.last_name,
    date_of_birth: p.date_of_birth,
    biological_sex: p.biological_sex,
    relationship: p.relationship,
    is_account_holder: p.is_account_holder,
  }));

  const assignments: OnboardingAssignment[] = payload.assignments.map(
    (a) => {
      const t = testMap.get(a.test_id);
      const lab = Array.isArray(t?.lab) ? t?.lab[0] : t?.lab;
      return {
        test_name: t?.name ?? "Unknown test",
        lab_name: lab?.name ?? "",
        specimen_type: t?.specimen_type ?? null,
        requires_fasting: /fasting/i.test(t?.turnaround_display ?? ""),
        person_index: a.person_index,
      };
    }
  );

  const summary: OnboardingSummary = {
    sessionId,
    orderIdShort,
    total,
    prefilledEmail: session.customer_email ?? user?.email ?? "",
    persons,
    assignments,
    collectionCity: payload.collection_address.city,
    collectionAddress: {
      address_line1: payload.collection_address.address_line1,
      address_line2: payload.collection_address.address_line2,
      city: payload.collection_address.city,
      province: payload.collection_address.province,
      postal_code: payload.collection_address.postal_code,
    },
  };

  return (
    <PostPurchaseOnboarding
      alreadyLoggedIn={alreadyLoggedIn}
      hasProfile={hasProfile}
      waiverDone={waiverDone}
      summary={summary}
    />
  );
}
