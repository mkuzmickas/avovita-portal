import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/clients/[accountId]/summary
 *
 * Admin-only. Returns the data behind the client-summary pop-up:
 *   - account (email, waiver signature name, created_at, representative flag)
 *   - primary profile (name, DOB, sex, phone, address) when present
 *   - orders list — short id, created_at, appointment_date, status,
 *     total_cad, line items (SKU, name, unit price)
 *
 * Lightweight — intended to be fired on-demand from a modal, so it stays
 * under ~50 lines of DB work and returns a flat JSON shape the modal can
 * render without further joins.
 */

export interface ClientSummaryResponse {
  account: {
    id: string;
    email: string | null;
    waiver_signed_name: string | null;
    is_representative: boolean;
    created_at: string;
  };
  primary_profile: {
    first_name: string | null;
    last_name: string | null;
    date_of_birth: string | null;
    biological_sex: string | null;
    phone: string | null;
    address_line1: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
  } | null;
  orders: Array<{
    id: string;
    short_id: string;
    created_at: string;
    appointment_date: string | null;
    status: string;
    total_cad: number;
    lines: Array<{
      sku: string | null;
      test_name: string | null;
      quantity: number;
      unit_price_cad: number;
    }>;
  }>;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  // Admin gate — same pattern as other admin routes.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: accountRow } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const account = accountRow as { role: string } | null;
  if (!account || account.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { accountId } = await params;

  const service = createServiceRoleClient();

  // 1. Account row.
  const { data: acc } = await service
    .from("accounts")
    .select("id, email, waiver_signed_name, is_representative, created_at")
    .eq("id", accountId)
    .single();
  if (!acc) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // 2. Primary profile.
  const { data: profileRow } = await service
    .from("patient_profiles")
    .select(
      "first_name, last_name, date_of_birth, biological_sex, phone, address_line1, city, province, postal_code",
    )
    .eq("account_id", accountId)
    .eq("is_primary", true)
    .maybeSingle();

  // 3. Orders + lines.
  const { data: orderRows } = await service
    .from("orders")
    .select(
      `
      id, created_at, appointment_date, status, total_cad,
      order_lines (
        quantity, unit_price_cad,
        test:tests ( sku, name )
      )
    `,
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  type RawOrder = {
    id: string;
    created_at: string;
    appointment_date: string | null;
    status: string;
    total_cad: number | null;
    order_lines: Array<{
      quantity: number | null;
      unit_price_cad: number | null;
      test: { sku: string | null; name: string | null } | null;
    }>;
  };

  const orders = ((orderRows ?? []) as unknown as RawOrder[]).map((o) => ({
    id: o.id,
    short_id: o.id.slice(0, 8).toUpperCase(),
    created_at: o.created_at,
    appointment_date: o.appointment_date,
    status: o.status,
    total_cad: Number(o.total_cad ?? 0),
    lines: (o.order_lines ?? []).map((l) => ({
      sku: l.test?.sku ?? null,
      test_name: l.test?.name ?? null,
      quantity: Number(l.quantity ?? 1),
      unit_price_cad: Number(l.unit_price_cad ?? 0),
    })),
  }));

  const payload: ClientSummaryResponse = {
    account: {
      id: acc.id as string,
      email: (acc.email as string | null) ?? null,
      waiver_signed_name: (acc.waiver_signed_name as string | null) ?? null,
      is_representative: Boolean(acc.is_representative),
      created_at: acc.created_at as string,
    },
    primary_profile: profileRow
      ? {
          first_name: (profileRow.first_name as string | null) ?? null,
          last_name: (profileRow.last_name as string | null) ?? null,
          date_of_birth: (profileRow.date_of_birth as string | null) ?? null,
          biological_sex:
            (profileRow.biological_sex as string | null) ?? null,
          phone: (profileRow.phone as string | null) ?? null,
          address_line1:
            (profileRow.address_line1 as string | null) ?? null,
          city: (profileRow.city as string | null) ?? null,
          province: (profileRow.province as string | null) ?? null,
          postal_code: (profileRow.postal_code as string | null) ?? null,
        }
      : null,
    orders,
  };

  return NextResponse.json(payload);
}
