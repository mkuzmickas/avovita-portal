import { createServiceRoleClient } from "@/lib/supabase/server";
import { ResourcesManager } from "@/components/admin/ResourcesManager";
import type { Resource } from "@/types/resources";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  const service = createServiceRoleClient();

  const { data: resourcesRaw } = await service
    .from("resources")
    .select(
      `
      id, title, description, price_cad, file_path,
      file_size_bytes, file_type, page_count,
      cover_image_url, active, featured, download_count,
      created_at, updated_at
    `,
    )
    .order("created_at", { ascending: false });

  const resources = (resourcesRaw ?? []) as unknown as Resource[];

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            <span style={{ color: "#c4973a" }}>Resources</span>
          </h1>
          <p className="mt-1" style={{ color: "#e8d5a3" }}>
            PDF resources — upload free and paid downloads for clients.
          </p>
        </div>
        <div
          className="rounded-lg border px-4 py-2"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <p className="text-xs" style={{ color: "#6ab04c" }}>
            Total Resources
          </p>
          <p className="text-xl font-semibold" style={{ color: "#c4973a" }}>
            {resources.length}
          </p>
        </div>
      </div>

      <ResourcesManager initialResources={resources} />
    </div>
  );
}
