import { notFound } from "next/navigation";
import { getOrgBySlug, ORGS_FEATURE_ENABLED } from "@/lib/org";
import { OrgProvider } from "@/components/org/OrgContext";
import { OrgLanding } from "@/components/org/OrgLanding";

export const dynamic = "force-dynamic";

export default async function OrgLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!ORGS_FEATURE_ENABLED) notFound();
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  return (
    <OrgProvider
      org={{
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo_url: org.logo_url,
        primary_color: org.primary_color,
        accent_color: org.accent_color,
      }}
    >
      <OrgLanding />
    </OrgProvider>
  );
}
