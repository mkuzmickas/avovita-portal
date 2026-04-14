import { createServiceRoleClient } from "@/lib/supabase/server";
import { OrganizationsManager } from "@/components/admin/OrganizationsManager";
import type { Organization } from "@/types/database";

export const dynamic = "force-dynamic";

export type OrganizationWithCounts = Organization & {
  client_count: number;
  order_count: number;
};

export default async function AdminOrganizationsPage() {
  const service = createServiceRoleClient();

  const { data: orgsRaw } = await service
    .from("organizations")
    .select(
      "id, name, slug, logo_url, primary_color, accent_color, contact_email, active, created_at"
    )
    .order("created_at", { ascending: false });
  const orgs = (orgsRaw ?? []) as unknown as Organization[];

  const counts = new Map<string, { clients: number; orders: number }>();
  if (orgs.length > 0) {
    const ids = orgs.map((o) => o.id);
    const [{ data: clientRows }, { data: orderRows }] = await Promise.all([
      service.from("accounts").select("org_id").in("org_id", ids),
      service.from("orders").select("org_id").in("org_id", ids),
    ]);
    for (const r of (clientRows ?? []) as { org_id: string | null }[]) {
      if (!r.org_id) continue;
      const e = counts.get(r.org_id) ?? { clients: 0, orders: 0 };
      e.clients += 1;
      counts.set(r.org_id, e);
    }
    for (const r of (orderRows ?? []) as { org_id: string | null }[]) {
      if (!r.org_id) continue;
      const e = counts.get(r.org_id) ?? { clients: 0, orders: 0 };
      e.orders += 1;
      counts.set(r.org_id, e);
    }
  }

  const orgsWithCounts: OrganizationWithCounts[] = orgs.map((o) => ({
    ...o,
    client_count: counts.get(o.id)?.clients ?? 0,
    order_count: counts.get(o.id)?.orders ?? 0,
  }));

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>Organizations</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          White-label partners with their own branded portal at
          {" "}
          <code style={{ color: "#c4973a" }}>portal.avovita.ca/org/[slug]</code>.
        </p>
      </div>
      <OrganizationsManager initialOrgs={orgsWithCounts} />
    </div>
  );
}
