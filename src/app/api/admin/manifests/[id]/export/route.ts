import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/manifests/[id]/export
 * Admin-only. Returns the manifest as CSV.
 * Columns: Appointment Date, Last Name, First Name, SKU, Fasting,
 * Cost CAD, Client Price CAD, Margin CAD
 * One row per order_line (so multi-test orders span multiple rows).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 }
      );
    }

    const { id: manifestId } = await params;
    const service = createServiceRoleClient();

    const { data: manifestRow } = await service
      .from("manifests")
      .select("name, ship_date")
      .eq("id", manifestId)
      .single();
    const manifest = manifestRow as { name: string; ship_date: string } | null;
    if (!manifest) {
      return NextResponse.json({ error: "Manifest not found" }, { status: 404 });
    }

    const { data: ordersRaw, error: ordersErr } = await service
      .from("orders")
      .select(
        `
        id, appointment_date,
        order_lines (
          unit_price_cad,
          test:tests ( sku, cost_cad, turnaround_display ),
          profile:patient_profiles ( first_name, last_name )
        )
      `
      )
      .eq("manifest_id", manifestId)
      .order("appointment_date", { ascending: true });

    if (ordersErr) {
      return NextResponse.json(
        { error: `Failed to load orders: ${ordersErr.message}` },
        { status: 500 }
      );
    }

    type LineRow = {
      unit_price_cad: number | null;
      test: {
        sku: string | null;
        cost_cad: number | null;
        turnaround_display: string | null;
      } | null;
      profile: {
        first_name: string | null;
        last_name: string | null;
      } | null;
    };
    type OrderRow = {
      id: string;
      appointment_date: string | null;
      order_lines: LineRow[];
    };

    const orders = (ordersRaw ?? []) as unknown as OrderRow[];

    const header = [
      "Appointment Date",
      "Last Name",
      "First Name",
      "SKU",
      "Fasting",
      "Cost CAD",
      "Client Price CAD",
      "Margin CAD",
    ];
    const rows: string[][] = [header];

    for (const order of orders) {
      for (const line of order.order_lines ?? []) {
        const apptDate = order.appointment_date ?? "";
        const lastName = line.profile?.last_name ?? "";
        const firstName = line.profile?.first_name ?? "";
        const sku = line.test?.sku ?? "";
        const fasting = /fasting/i.test(line.test?.turnaround_display ?? "")
          ? "Yes"
          : "No";
        const cost = line.test?.cost_cad ?? null;
        const price = line.unit_price_cad;
        const margin =
          cost != null && price != null ? (price - cost).toFixed(2) : "";
        rows.push([
          apptDate,
          lastName,
          firstName,
          sku,
          fasting,
          cost != null ? cost.toFixed(2) : "",
          price != null ? price.toFixed(2) : "",
          margin,
        ]);
      }
    }

    const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n");
    const filename = `manifest-${slugify(manifest.name)}-${manifest.ship_date}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[manifests:export]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function escapeCsv(value: string): string {
  if (value == null) return "";
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
