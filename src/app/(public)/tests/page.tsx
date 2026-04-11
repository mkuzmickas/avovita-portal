import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CatalogueClient } from "@/components/catalogue/CatalogueClient";
import { CatalogueSkeleton } from "@/components/catalogue/Skeleton";
import type { CatalogueTest } from "@/components/catalogue/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lab Test Catalogue",
  description:
    "Browse private lab tests available for in-home collection in Calgary. Hormones, fertility, autoimmune, heart health, cancer screening, and more — delivered by Mayo Clinic Laboratories, Armin Labs, Dynacare, ReligenDx, and Precision Epigenomics.",
  openGraph: {
    title: "Lab Test Catalogue — AvoVita Wellness",
    description:
      "Browse private lab tests available for in-home collection in Calgary.",
    type: "website",
  },
};

export default function TestsPage() {
  return (
    <Suspense fallback={<CatalogueSkeleton />}>
      <CatalogueData />
    </Suspense>
  );
}

async function CatalogueData() {
  const supabase = await createClient();

  // Fetch all active tests with lab joined — single query, then split client-side
  const { data: testsRaw } = await supabase
    .from("tests")
    .select(
      `
      id,
      name,
      slug,
      description,
      category,
      price_cad,
      turnaround_display,
      specimen_type,
      ship_temp,
      stability_notes,
      order_type,
      featured,
      lab:labs(id, name)
      `
    )
    .eq("active", true)
    .order("featured", { ascending: false })
    .order("name", { ascending: true });

  type RawRow = Omit<CatalogueTest, "lab"> & {
    lab: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const allTests: CatalogueTest[] = ((testsRaw ?? []) as unknown as RawRow[]).map(
    (row) => {
      const lab = Array.isArray(row.lab) ? row.lab[0] : row.lab;
      return {
        ...row,
        lab: lab ?? { id: "", name: "—" },
      };
    }
  );

  const featuredTests = allTests.filter((t) => t.featured);

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
      allTests={allTests}
      categories={categories}
      labs={labs}
      isLoggedIn={!!user}
    />
  );
}
