import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  VITALITY_CHECK_ENABLED,
  VITALITY_CHECK_OPTIONS,
} from "@/lib/promo/vitalityCheck";

export const runtime = "nodejs";

/**
 * GET /api/promo/vitality-check
 *
 * Hydrates the promo picker with current retail price + test_id for
 * each configured option. Returns 404 when the promo is disabled so
 * the client-side modal silently stays closed.
 *
 * Public (no auth) — the data is catalogue-public and the server
 * re-validates eligibility + allowed SKUs at Stripe session create.
 */
export async function GET() {
  if (!VITALITY_CHECK_ENABLED) {
    return NextResponse.json({ enabled: false, options: [] });
  }
  const service = createServiceRoleClient();
  const skus = VITALITY_CHECK_OPTIONS.map((o) => o.sku);
  const { data, error } = await service
    .from("tests")
    .select("id, sku, name, price_cad, cost_cad, lab:labs(name), active")
    .in("sku", skus);
  if (error) {
    return NextResponse.json(
      { error: `Failed to load options: ${error.message}` },
      { status: 500 },
    );
  }
  type Row = {
    id: string;
    sku: string;
    name: string;
    price_cad: number | null;
    cost_cad: number | null;
    lab: { name: string | null } | { name: string | null }[] | null;
    active: boolean | null;
  };
  const rows = (data ?? []) as Row[];
  const options = VITALITY_CHECK_OPTIONS.map((spec) => {
    const row = rows.find((r) => r.sku === spec.sku);
    if (!row || row.active === false) return null;
    const lab = Array.isArray(row.lab) ? row.lab[0] : row.lab;
    return {
      sku: spec.sku,
      label: spec.label,
      tagline: spec.tagline,
      audience: spec.audience,
      test_id: row.id,
      price_cad: Number(row.price_cad ?? 0),
      lab_name: lab?.name ?? "",
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  return NextResponse.json({ enabled: true, options });
}
