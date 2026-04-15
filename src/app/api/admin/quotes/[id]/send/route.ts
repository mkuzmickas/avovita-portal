import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import {
  renderQuoteEmail,
  quoteEmailSubject,
  type QuoteEmailLine,
} from "@/lib/emails/quoteSent";

export const runtime = "nodejs";

/**
 * POST /api/admin/quotes/[id]/send
 * Renders + sends the branded quote email via Resend, marks status='sent',
 * and stamps sent_at.
 */
export async function POST(
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

    const { id } = await params;
    const service = createServiceRoleClient();

    const { data: quoteRaw } = await service
      .from("quotes")
      .select(
        `
        id, quote_number, client_first_name, client_last_name, client_email,
        subtotal_cad, discount_cad, visit_fee_cad, total_cad,
        expires_at, notes
      `
      )
      .eq("id", id)
      .maybeSingle();

    type QuoteRow = {
      id: string;
      quote_number: string;
      client_first_name: string;
      client_last_name: string;
      client_email: string;
      subtotal_cad: number;
      discount_cad: number;
      visit_fee_cad: number;
      total_cad: number;
      expires_at: string | null;
      notes: string | null;
    };
    const quote = quoteRaw as QuoteRow | null;

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }
    if (!quote.client_email) {
      return NextResponse.json(
        { error: "Quote has no client email" },
        { status: 400 }
      );
    }
    if (!quote.client_first_name) {
      return NextResponse.json(
        { error: "Quote has no client first name" },
        { status: 400 }
      );
    }

    const { data: linesRaw } = await service
      .from("quote_lines")
      .select(
        `
        unit_price_cad, person_label,
        test:tests ( name, lab:labs ( name ) )
      `
      )
      .eq("quote_id", id)
      .order("created_at", { ascending: true });

    type RawLine = {
      unit_price_cad: number;
      person_label: string | null;
      test: {
        name: string;
        lab: { name: string } | { name: string }[] | null;
      } | null;
    };
    const linesRaw2 = (linesRaw ?? []) as unknown as RawLine[];

    if (linesRaw2.length === 0) {
      return NextResponse.json(
        { error: "Quote has no tests; add at least one before sending" },
        { status: 400 }
      );
    }

    const emailLines: QuoteEmailLine[] = linesRaw2.map((l) => {
      const lab = Array.isArray(l.test?.lab) ? l.test?.lab[0] : l.test?.lab;
      return {
        test_name: l.test?.name ?? "Test",
        lab_name: lab?.name ?? "—",
        person_label: l.person_label,
        unit_price_cad: l.unit_price_cad,
      };
    });

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca"
    ).replace(/\/$/, "");
    const catalogueUrl = `${appUrl}/tests`;
    const acceptUrl = `${appUrl}/checkout?quote=${encodeURIComponent(quote.quote_number)}`;

    const html = renderQuoteEmail({
      firstName: quote.client_first_name,
      quoteNumber: quote.quote_number,
      lines: emailLines,
      subtotal: quote.subtotal_cad,
      discount: quote.discount_cad,
      visitFee: quote.visit_fee_cad,
      total: quote.total_cad,
      expiresAt: quote.expires_at,
      notes: quote.notes,
      catalogueUrl,
      acceptUrl,
    });

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_ORDERS!,
        to: quote.client_email,
        subject: quoteEmailSubject(quote.quote_number),
        html,
      });
    } catch (err) {
      console.error("[quotes:send] resend error:", err);
      return NextResponse.json(
        { error: "Failed to send email — check Resend configuration" },
        { status: 502 }
      );
    }

    const nowIso = new Date().toISOString();
    await service
      .from("quotes")
      .update({ status: "sent", sent_at: nowIso })
      .eq("id", id);

    // Log notification (best-effort)
    try {
      await service.from("notifications").insert({
        profile_id: null,
        order_id: null,
        result_id: null,
        channel: "email",
        template: "quote_sent",
        recipient: quote.client_email,
        status: "sent",
      });
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ success: true, sent_at: nowIso });
  } catch (err) {
    console.error("[quotes:send]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
