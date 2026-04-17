import { createClient } from "@/lib/supabase/server";
import { CheckoutRouter } from "@/components/checkout/CheckoutRouter";
import { OrgProvider } from "@/components/org/OrgContext";
import { getOrgBySlug } from "@/lib/org";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your AvoVita lab test order.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ org_slug?: string; org?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Accept either ?org_slug= (canonical) or ?org= (back-compat shorthand).
  const params = await searchParams;
  const slug = params.org_slug ?? params.org ?? null;
  const org = slug ? await getOrgBySlug(slug) : null;

  const client = (
    <CheckoutRouter
      accountUserId={user?.id ?? null}
      accountEmail={user?.email ?? null}
    />
  );

  return org ? <OrgProvider org={org}>{client}</OrgProvider> : client;
}
