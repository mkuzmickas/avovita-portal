import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveManualDiscount } from "@/lib/quotes/totals";

export const runtime = "nodejs";

/**
 * GET /api/quotes/[number]
 *
 * Public lookup used by /checkout?quote=AVO-... to pre-populate the
 * cart. Returns the quote's test lines only when the quote exists,
 * has a status of draft or sent, and has not expired. Otherwise 410.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ number: string }> }
) {
  try {
    const { number } = await params;
    const quoteNumber = number.trim();
    if (!quoteNumber) {
      return NextResponse.json(
        { error: "Quote number is required" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    const { data: quoteRaw } = await service
      .from("quotes")
      .select(
        `id, quote_number, status, expires_at,
         subtotal_cad, discount_cad, visit_fee_cad,
         manual_discount_value, manual_discount_type,
         lines:quote_lines(
           test_id, unit_price_cad,
           test:tests(id, name, lab:labs(name))
         )`
      )
      .eq("quote_number", quoteNumber)
      .maybeSingle();

    type Row = {
      id: string;
      quote_number: string;
      status: string;
      expires_at: string | null;
      subtotal_cad: number;
      discount_cad: number;
      visit_fee_cad: number;
      manual_discount_value: number | null;
      manual_discount_type: "amount" | "percent" | null;
      lines: Array<{
        test_id: string;
        unit_price_cad: number;
        test:
          | {
              id: string;
              name: string;
              lab: { name: string } | { name: string }[] | null;
            }
          | {
              id: string;
              name: string;
              lab: { name: string } | { name: string }[] | null;
            }[]
          | null;
      }>;
    };
    const quote = quoteRaw as Row | null;
    if (!quote) {
      return NextResponse.json(
        { error: "Quote not found" },
        { status: 404 }
      );
    }

    const allowedStatus = ["draft", "sent"];
    if (!allowedStatus.includes(quote.status)) {
      return NextResponse.json(
        {
          error:
            "This quote is no longer available. Please contact support@avovita.ca if you need a new one.",
        },
        { status: 410 }
      );
    }
    if (quote.expires_at && new Date(quote.expires_at) <= new Date()) {
      return NextResponse.json(
        {
          error:
            "This quote has expired. Please contact support@avovita.ca to request an updated quote.",
        },
        { status: 410 }
      );
    }

    const items = quote.lines.map((l) => {
      const t = Array.isArray(l.test) ? l.test[0] : l.test;
      const lab = Array.isArray(t?.lab) ? t?.lab[0] : t?.lab;
      return {
        test_id: l.test_id,
        test_name: t?.name ?? "Test",
        lab_name: lab?.name ?? "",
        price_cad: Number(l.unit_price_cad),
      };
    });

    // Resolve the admin-entered additional discount to a dollar amount
    // using the quote's snapshotted subtotal / visit fee / multi-test
    // discount. Pinning to the quote (not the customer's live cart)
    // means the discount equals what the emailed quote promised even
    // if the cart is modified before checkout.
    const manualDiscountCad = resolveManualDiscount(
      Number(quote.subtotal_cad),
      Number(quote.discount_cad),
      Number(quote.visit_fee_cad),
      {
        value: Number(quote.manual_discount_value ?? 0),
        type: quote.manual_discount_type ?? "amount",
      }
    );

    return NextResponse.json({
      valid: true,
      quote_number: quote.quote_number,
      items,
      manual_discount_cad: manualDiscountCad,
    });
  } catch (err) {
    console.error("[quotes:lookup]", err);
    return NextResponse.json(
      { error: "Failed to load quote" },
      { status: 500 }
    );
  }
}
