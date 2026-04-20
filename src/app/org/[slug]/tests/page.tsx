import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CatalogueClient } from "@/components/catalogue/CatalogueClient";
import { CatalogueSkeleton } from "@/components/catalogue/Skeleton";
import { OrgProvider } from "@/components/org/OrgContext";
import { getOrgBySlug, ORGS_FEATURE_ENABLED } from "@/lib/org";
import { pickPanels } from "@/lib/catalogue/panels";
import type { CatalogueTest } from "@/components/catalogue/types";

export const dynamic = "force-dynamic";

export default async function OrgTestsPage({
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
      <Suspense fallback={<CatalogueSkeleton />}>
        <CatalogueData />
      </Suspense>
    </OrgProvider>
  );
}

async function CatalogueData() {
  const supabase = await createClient();
  const { data: testsRaw } = await supabase
    .from("tests")
    .select(
      `
      id, name, slug, description, category, price_cad,
      turnaround_display, specimen_type, ship_temp, stability_notes,
      collection_method, featured, sku, requisition_url, panel_tests,
      lab:labs(id, name)
      `
    )
    .eq("active", true)
    .order("name", { ascending: true });

  type RawRow = Omit<CatalogueTest, "lab"> & {
    lab: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const allTests: CatalogueTest[] = ((testsRaw ?? []) as unknown as RawRow[]).map(
    (row) => {
      const lab = Array.isArray(row.lab) ? row.lab[0] : row.lab;
      return { ...row, lab: lab ?? { id: "", name: "—" } };
    }
  );
  const featuredTests = allTests.filter((t) => t.featured);
  const panelTests = pickPanels(allTests);
  const categories = Array.from(
    new Set(allTests.map((t) => t.category).filter((c): c is string => !!c))
  ).sort();
  const labs = Array.from(new Set(allTests.map((t) => t.lab.name))).sort();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <CatalogueClient
      featuredTests={featuredTests}
      panelTests={panelTests}
      allTests={allTests}
      categories={categories}
      labs={labs}
      isLoggedIn={!!user}
    />
  );
}
