import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Organization } from "@/types/database";

export const ORGS_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_ORGS === "true";

/**
 * Looks up an organization by slug. Returns null when:
 *   - the orgs feature flag is off
 *   - no row matches the slug
 *   - the row exists but is inactive
 *
 * Slug match is case-sensitive — the seed uses "AlwaysBestCare"
 * (CamelCase) deliberately for branding.
 */
export async function getOrgBySlug(
  slug: string
): Promise<Organization | null> {
  if (!ORGS_FEATURE_ENABLED) return null;
  const service = createServiceRoleClient();
  const { data } = await service
    .from("organizations")
    .select(
      "id, name, slug, logo_url, primary_color, accent_color, contact_email, active, created_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  const org = data as Organization | null;
  if (!org || !org.active) return null;
  return org;
}

/**
 * Lightweight by-id lookup. Used by the Stripe checkout route to resolve
 * the slug attached to the cart back to the org_id we tag on the order.
 */
export async function getOrgIdBySlug(slug: string): Promise<string | null> {
  if (!ORGS_FEATURE_ENABLED) return null;
  const service = createServiceRoleClient();
  const { data } = await service
    .from("organizations")
    .select("id, active")
    .eq("slug", slug)
    .maybeSingle();
  const row = data as { id: string; active: boolean } | null;
  if (!row || !row.active) return null;
  return row.id;
}
