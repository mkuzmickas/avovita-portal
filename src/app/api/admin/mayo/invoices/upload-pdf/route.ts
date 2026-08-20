import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { parseMayoPdf } from "@/lib/mayo/parse-mayo-pdf";
import { runAutoMatchForInvoice } from "@/app/api/admin/mayo/invoices/route";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/mayo/invoices/upload-pdf
 *
 * Accepts multipart/form-data with a `file` field pointing at a Mayo
 * Clinic monthly invoice PDF. Parses the PDF into
 * (invoice_number, invoice_date, total_usd, lines[]), inserts
 * (idempotent on invoice_number + accession + test_id), then runs the
 * name-based auto-matcher against portal orders.
 *
 * On parse failure it returns a 400 with the parser's error so Mike
 * can fall back to hand-crafted JSON via /api/admin/mayo/invoices.
 *
 * Kept as a separate route from the JSON upload so the two content
 * types don't share Body parsing edge cases.
 */

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: account } = (await supabase
    .from("accounts")
    .select("role, email")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role" | "email"> | null };
  if (account?.role !== "admin") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No `file` field found in the upload." },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only .pdf files accepted." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseMayoPdf(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `PDF parse failed: ${msg}` },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Upsert invoice header (same idempotency contract as JSON upload)
  const { data: existing } = await service
    .from("mayo_invoices")
    .select("id")
    .eq("invoice_number", parsed.invoice_number)
    .maybeSingle();

  let invoiceId: string;
  if (existing) {
    invoiceId = (existing as { id: string }).id;
    await service
      .from("mayo_invoices")
      .update({
        invoice_date: parsed.invoice_date,
        total_usd: parsed.total_usd,
        source_filename: file.name,
        uploaded_by: account.email ?? user.email ?? null,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
  } else {
    const { data: created, error: insErr } = await service
      .from("mayo_invoices")
      .insert({
        invoice_number: parsed.invoice_number,
        invoice_date: parsed.invoice_date,
        total_usd: parsed.total_usd,
        source_filename: file.name,
        uploaded_by: account.email ?? user.email ?? null,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return NextResponse.json(
        {
          error: `Failed to create invoice: ${insErr?.message ?? "unknown"}`,
        },
        { status: 500 },
      );
    }
    invoiceId = (created as { id: string }).id;
  }

  const rows = parsed.lines.map((l) => ({
    invoice_id: invoiceId,
    collection_date: l.collection_date,
    accession_no: l.accession_no,
    specimen_no: l.specimen_no,
    mayo_patient_id: l.mayo_patient_id,
    patient_name: l.patient_name,
    test_id: l.test_id,
    cpt: l.cpt,
    description: l.description,
    charge_usd: l.charge_usd,
  }));

  const { error: upsertErr } = await service
    .from("mayo_invoice_lines")
    .upsert(rows, { onConflict: "invoice_id,accession_no,test_id" });
  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to save lines: ${upsertErr.message}` },
      { status: 500 },
    );
  }

  // Accession-grouped auto-match (shared engine with the JSON route)
  const stats = await runAutoMatchForInvoice(service, invoiceId);

  // Invoice-total sanity check — surface any drift between the
  // extracted line-sum and Mayo's Grand Total so Mike can spot
  // parse errors.
  const linesSum = rows.reduce((s, r) => s + Number(r.charge_usd), 0);
  const drift = Math.round((linesSum - parsed.total_usd) * 100) / 100;

  return NextResponse.json({
    ok: true,
    invoice_id: invoiceId,
    invoice_number: parsed.invoice_number,
    lines_upserted: rows.length,
    auto_matched: stats.autoMatched,
    unmatched: stats.unmatched,
    parsed_total: parsed.total_usd,
    line_sum: Math.round(linesSum * 100) / 100,
    drift_cad: drift,
  });
}
