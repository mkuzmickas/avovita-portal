import { notFound, redirect } from "next/navigation";
import { getOrgBySlug, ORGS_FEATURE_ENABLED } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function OrgCheckoutRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!ORGS_FEATURE_ENABLED) notFound();
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  // The CheckoutClient picks up org_slug from the query string and
  // persists it via OrgContext's localStorage so it survives any
  // navigation within the checkout flow.
  redirect(`/checkout?org_slug=${encodeURIComponent(org.slug)}`);
}
