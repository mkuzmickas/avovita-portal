import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  generateInvoicePdf,
  type InvoiceInput,
  type InvoiceLine,
} from "@/lib/invoices/generateInvoicePdf";

export const runtime = "nodejs";

/**
 * GET /api/orders/[orderId]/pdf
 *
 * On-demand PDF receipt / invoice for an order. Always regenerated
 * fresh from current DB state — no caching, no stored copies.
 *
 * Auth: an authenticated customer can download their own orders
 * (account_id match). Admins can download any order. Anonymous
 * requests are 401.
 *
 * Eligibility: orders with status in {confirmed, collected, shipped,
 * resulted, complete} and a non-zero total. AVOVITA-TEST $0 internal
 * orders are excluded entirely — the spec opts for hide-rather-than-
 * label so customers never see a "not real" stamp on something they
 * thought they paid for.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve role for the auth gate. We use the user-scoped client so
    // we can later read the order under RLS — admin gets the service
    // role for everything.
    const { data: accountRow } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = (accountRow as { role?: string } | null)?.role ?? "patient";
    const isAdmin = role === "admin";

    const service = createServiceRoleClient();

    // Fetch the order + the joins we need for the PDF. visit_groups
    // is the address — it has one row per order in production
    // (confirmed via probe). order_lines join out to tests / supplements
    // / resources for line-item names.
    const { data: orderRaw, error: orderErr } = await service
      .from("orders")
      .select(
        `id, status, account_id,
         subtotal_cad, discount_cad, home_visit_fee_cad, tax_cad,
         total_cad, appointment_date, created_at,
         stripe_payment_intent_id,
         account:accounts(email),
         lines:order_lines(
           id, line_type, quantity, unit_price_cad,
           custom_description,
           test:tests(name, sku),
           supplement:supplements(name, sku),
           resource:resources(title),
           profile:patient_profiles(first_name, last_name)
         ),
         visit_group:visit_groups(
           address_line1, address_line2, city, province, postal_code
         )`,
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !orderRaw) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    type AccountBlock = { email: string | null } | { email: string | null }[];
    type ProfileBlock =
      | { first_name: string; last_name: string }
      | { first_name: string; last_name: string }[]
      | null;
    type TestBlock = { name: string; sku: string | null } | { name: string; sku: string | null }[] | null;
    type SupplementBlock = TestBlock;
    type ResourceBlock = { title: string } | { title: string }[] | null;
    type LineRow = {
      id: string;
      line_type: "test" | "supplement" | "resource" | "custom";
      quantity: number;
      unit_price_cad: number;
      custom_description: string | null;
      test: TestBlock;
      supplement: SupplementBlock;
      resource: ResourceBlock;
      profile: ProfileBlock;
    };
    type VisitGroupBlock =
      | {
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          province: string | null;
          postal_code: string | null;
        }
      | {
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          province: string | null;
          postal_code: string | null;
        }[]
      | null;

    const order = orderRaw as unknown as {
      id: string;
      status: string;
      account_id: string | null;
      subtotal_cad: number | null;
      discount_cad: number | null;
      home_visit_fee_cad: number | null;
      tax_cad: number | null;
      total_cad: number | null;
      appointment_date: string | null;
      created_at: string;
      stripe_payment_intent_id: string | null;
      account: AccountBlock | null;
      lines: LineRow[] | null;
      visit_group: VisitGroupBlock;
    };

    // ── Auth gate ──
    if (!isAdmin && order.account_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Eligibility ──
    const PAID_STATUSES = new Set([
      "confirmed",
      "scheduled",
      "collected",
      "shipped",
      "resulted",
      "complete",
    ]);
    if (!PAID_STATUSES.has(order.status)) {
      return NextResponse.json(
        { error: "Invoice PDF is only available for paid orders." },
        { status: 409 },
      );
    }
    if ((order.total_cad ?? 0) <= 0) {
      // Internal-testing zero-dollar orders (AVOVITA-TEST). Not a real
      // transaction; no receipt to render.
      return NextResponse.json(
        { error: "Invoice PDF is not available for this order." },
        { status: 409 },
      );
    }

    // ── Resolve client identity ──
    const lines = order.lines ?? [];
    const firstProfile = lines
      .map((l) => l.profile)
      .find((p): p is { first_name: string; last_name: string } => {
        if (!p) return false;
        return !Array.isArray(p)
          ? !!p.first_name
          : !!p[0]?.first_name;
      });
    const firstProfileObj = Array.isArray(firstProfile)
      ? firstProfile[0]
      : firstProfile;
    let clientName = firstProfileObj
      ? `${firstProfileObj.first_name} ${firstProfileObj.last_name}`
      : "AvoVita Customer";

    let clientDob: string | null = null;
    let clientPhone: string | null = null;
    if (order.account_id) {
      const { data: profileRaw } = await service
        .from("patient_profiles")
        .select("first_name, last_name, date_of_birth, phone")
        .eq("account_id", order.account_id)
        .eq("is_primary", true)
        .maybeSingle();
      const primary = profileRaw as
        | {
            first_name: string;
            last_name: string;
            date_of_birth: string | null;
            phone: string | null;
          }
        | null;
      if (primary) {
        clientName = `${primary.first_name} ${primary.last_name}`;
        clientDob = primary.date_of_birth;
        clientPhone = primary.phone;
      }
    }

    const accountObj = Array.isArray(order.account)
      ? order.account[0]
      : order.account;
    const clientEmail = accountObj?.email ?? null;

    // ── Resolve address ──
    const vg = Array.isArray(order.visit_group)
      ? order.visit_group[0]
      : order.visit_group;
    const collectionAddressLines: string[] | null = vg?.address_line1
      ? [
          vg.address_line1,
          vg.address_line2 || "",
          [vg.city, vg.province, vg.postal_code].filter(Boolean).join(", "),
        ].filter((s) => s.length > 0)
      : null;

    // ── Build line items ──
    const invoiceLines: InvoiceLine[] = lines.map((l) => {
      const test = Array.isArray(l.test) ? l.test[0] : l.test;
      const supplement = Array.isArray(l.supplement)
        ? l.supplement[0]
        : l.supplement;
      const resource = Array.isArray(l.resource) ? l.resource[0] : l.resource;
      const profile = Array.isArray(l.profile) ? l.profile[0] : l.profile;
      let description = "Item";
      let sku: string | null = null;
      if (l.line_type === "test" && test) {
        description = test.name;
        sku = test.sku ?? null;
      } else if (l.line_type === "supplement" && supplement) {
        description = supplement.name;
        sku = supplement.sku ?? null;
      } else if (l.line_type === "resource" && resource) {
        description = resource.title;
      } else if (l.line_type === "custom" && l.custom_description) {
        description = l.custom_description;
      }
      return {
        description,
        sku,
        assignedToName: profile
          ? `${profile.first_name} ${profile.last_name}`
          : null,
        unitPriceCad: l.unit_price_cad,
        quantity: l.quantity,
      };
    });

    const STATUS_LABEL: Record<string, string> = {
      confirmed: "Confirmed · Paid",
      scheduled: "Scheduled · Paid",
      collected: "Collected · Paid",
      shipped: "Shipped · Paid",
      resulted: "Results Available · Paid",
      complete: "Complete · Paid",
    };

    const orderIdShort = order.id.slice(0, 8).toUpperCase();

    // GST: prefer the stored tax_cad. Many historical orders left this
    // null / 0 even though GST WAS collected (it's baked into total_cad)
    // — derive it from the totals math in that case so old orders show
    // a proper invoice with the GST line broken out.
    const subtotal = order.subtotal_cad ?? 0;
    const discount = order.discount_cad ?? 0;
    const homeVisit = order.home_visit_fee_cad ?? 0;
    const total = order.total_cad ?? 0;
    const storedTax = order.tax_cad ?? 0;
    const derivedTax = Math.max(0, total - (subtotal - discount + homeVisit));
    const taxCad =
      storedTax > 0 ? storedTax : Math.round(derivedTax * 100) / 100;

    const input: InvoiceInput = {
      orderIdShort,
      orderIdFull: order.id,
      orderDateIso: order.created_at,
      appointmentDateIso: order.appointment_date,
      statusLabel: STATUS_LABEL[order.status] ?? order.status,

      clientName,
      clientDob,
      clientEmail,
      clientPhone,

      lines: invoiceLines,
      collectionAddressLines,

      subtotalCad: subtotal,
      discountCad: discount,
      homeVisitFeeCad: homeVisit,
      taxCad,
      totalCad: total,

      paymentLabel: order.stripe_payment_intent_id
        ? "Paid via credit card"
        : "Paid",
    };

    const pdfBytes = await generateInvoicePdf(input);

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="AvoVita-Invoice-${orderIdShort}.pdf"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[orders:pdf]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
