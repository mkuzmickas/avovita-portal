import { createServiceRoleClient } from "@/lib/supabase/server";
import { PromoCodesManager } from "@/components/admin/PromoCodesManager";

export const dynamic = "force-dynamic";

export type AdminPromoCode = {
  id: string;
  code: string;
  description: string | null;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  active: boolean;
  stripe_promo_id: string | null;
  stripe_coupon_id: string | null;
  org_id: string | null;
  org_name: string | null;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: string | null;
  created_at: string;
};

export type OrgOption = { id: string; name: string; slug: string };

export default async function AdminPromoCodesPage() {
  const service = createServiceRoleClient();

  const [{ data: codesRaw }, { data: orgsRaw }] = await Promise.all([
    service
      .from("promo_codes")
      .select(
        `
        id, code, description, percent_off, amount_off, currency, active,
        stripe_promo_id, stripe_coupon_id, org_id, max_redemptions,
        times_redeemed, expires_at, created_at,
        org:organizations(name)
      `
      )
      .order("created_at", { ascending: false }),
    service
      .from("organizations")
      .select("id, name, slug")
      .order("name"),
  ]);

  type RawCode = Omit<AdminPromoCode, "org_name"> & {
    org: { name: string } | { name: string }[] | null;
  };
  const codes: AdminPromoCode[] = (
    (codesRaw ?? []) as unknown as RawCode[]
  ).map((c) => {
    const org = Array.isArray(c.org) ? c.org[0] : c.org;
    const { org: _drop, ...rest } = c;
    void _drop;
    return { ...rest, org_name: org?.name ?? null };
  });

  const orgs = (orgsRaw ?? []) as OrgOption[];

  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Promo <span style={{ color: "#c4973a" }}>Codes</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Manage discount codes. Stripe promo and coupon IDs must be
          created in the Stripe dashboard first; paste them here.
        </p>
      </div>

      <PromoCodesManager codes={codes} orgs={orgs} />
    </div>
  );
}
