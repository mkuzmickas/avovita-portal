import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

    return NextResponse.json({
      valid: true,
      quote_number: quote.quote_number,
      items,
    });
  } catch (err) {
    console.error("[quotes:lookup]", err);
    return NextResponse.json(
      { error: "Failed to load quote" },
      { status: 500 }
    );
  }
}
