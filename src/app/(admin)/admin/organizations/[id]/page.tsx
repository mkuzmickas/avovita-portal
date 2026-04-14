import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { OrganizationDetailClient } from "@/components/admin/OrganizationDetailClient";
import type { Organization } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceRoleClient();
  const { data } = await service
    .from("organizations")
    .select(
      "id, name, slug, logo_url, primary_color, accent_color, contact_email, active, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  const org = data as Organization | null;
  if (!org) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link
        href="/admin/organizations"
        className="inline-flex items-center gap-1.5 text-sm mb-3"
        style={{ color: "#e8d5a3" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Organizations
      </Link>
      <OrganizationDetailClient org={org} />
    </div>
  );
}
