import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SupplementsClient } from "@/components/supplements/SupplementsClient";
import type { Supplement } from "@/types/supplements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Supplements — AvoVita Wellness",
  description:
    "Browse AvoVita's curated supplement line. Practitioner-grade vitamins, minerals, and targeted formulas shipped Canada-wide.",
  openGraph: {
    title: "Supplements — AvoVita Wellness",
    description:
      "Practitioner-grade supplements shipped Canada-wide from AvoVita Wellness.",
    type: "website",
  },
};

export default function SupplementsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: "#0a1a0d" }}
        >
          <p className="text-sm" style={{ color: "#6ab04c" }}>
            Loading supplements…
          </p>
        </div>
      }
    >
      <SupplementsData />
    </Suspense>
  );
}

async function SupplementsData() {
  const supabase = await createClient();

  const { data: supplementsRaw } = await supabase
    .from("supplements")
    .select(
      `
      id, sku, name, brand, category, description,
      price_cad, image_url, featured,
      track_inventory, stock_qty
    `,
    )
    .eq("active", true)
    .order("name", { ascending: true });

  const supplements = (supplementsRaw ?? []) as unknown as Pick<
    Supplement,
    | "id"
    | "sku"
    | "name"
    | "brand"
    | "category"
    | "description"
    | "price_cad"
    | "image_url"
    | "featured"
    | "track_inventory"
    | "stock_qty"
  >[];

  const brands = Array.from(
    new Set(supplements.map((s) => s.brand).filter((b): b is string => !!b)),
  ).sort();

  const categories = Array.from(
    new Set(
      supplements.map((s) => s.category).filter((c): c is string => !!c),
    ),
  ).sort();

  return (
    <SupplementsClient
      supplements={supplements}
      brands={brands}
      categories={categories}
    />
  );
}
