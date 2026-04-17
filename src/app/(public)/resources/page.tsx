import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ResourcesClient } from "@/components/resources/ResourcesClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resources — AvoVita Wellness",
  description:
    "Browse free and premium health resources from AvoVita Wellness. Downloadable PDF guides, protocols, and educational materials.",
  openGraph: {
    title: "Resources — AvoVita Wellness",
    description:
      "Free and premium health resources from AvoVita Wellness.",
    type: "website",
  },
};

export type PublicResource = {
  id: string;
  title: string;
  description: string | null;
  price_cad: number;
  cover_image_url: string | null;
  page_count: number | null;
  file_size_bytes: number | null;
  featured: boolean;
};

export default function ResourcesPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: "#0a1a0d" }}
        >
          <p className="text-sm" style={{ color: "#6ab04c" }}>
            Loading resources…
          </p>
        </div>
      }
    >
      <ResourcesData />
    </Suspense>
  );
}

async function ResourcesData() {
  const supabase = await createClient();

  const { data: resourcesRaw } = await supabase
    .from("resources")
    .select(
      "id, title, description, price_cad, cover_image_url, page_count, file_size_bytes, featured",
    )
    .eq("active", true)
    .order("title", { ascending: true });

  const resources = (resourcesRaw ?? []) as unknown as PublicResource[];

  return <ResourcesClient resources={resources} />;
}
