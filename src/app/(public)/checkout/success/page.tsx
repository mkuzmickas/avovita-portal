import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { reassembleMetadata } from "@/lib/checkout/materialise";
import { CheckoutSuccessClient } from "@/components/checkout/CheckoutSuccessClient";

export const dynamic = "force-dynamic";

interface SearchParams {
  session_id?: string;
}

/**
 * Post-purchase landing page. Outcomes:
 *   - Missing/invalid session_id  → redirect to /tests
 *   - Logged in already           → CheckoutSuccessClient (auto-redirects to portal)
 *   - Guest checkout              → CheckoutSuccessClient with the create-account form
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id;

  if (!sessionId) {
    redirect("/tests");
  }

  // Verify the Stripe session
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    redirect("/tests");
  }

  if (session.payment_status !== "paid") {
    redirect("/tests");
  }

  const payload = reassembleMetadata(
    session.metadata as Record<string, string> | null
  );
  if (!payload) {
    redirect("/tests");
  }

  // Are they currently logged in?
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const alreadyLoggedIn = !!user;

  // Try to find the order so we can show a real ID — webhook may not have
  // fired yet, in which case we use a session-derived placeholder.
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

  const summary = {
    orderIdShort,
    total,
    personCount: payload.persons.length,
    testCount: payload.assignments.length,
    collectionCity: payload.collection_address.city,
    prefilledEmail: session.customer_email ?? user?.email ?? "",
  };

  return (
    <CheckoutSuccessClient
      sessionId={sessionId}
      alreadyLoggedIn={alreadyLoggedIn}
      summary={summary}
    />
  );
}
