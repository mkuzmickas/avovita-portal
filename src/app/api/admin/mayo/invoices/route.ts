import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  candidatesForLine,
  findByPrimaryKeys,
  pickAutoMatch,
} from "@/lib/mayo/match-candidates";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/mayo/invoices
 *
 * Uploads one Mayo invoice as JSON:
 *   {
 *     invoice_number: "7044716-053126",
 *     invoice_date:   "2026-05-31",
 *     total_usd:      7343.68,
 *     source_filename?: "MCL_invoice_2026-05-31.pdf",
 *     lines: [
 *       {
 *         collection_date: "2026-04-09",
 *         accession_no:    "ML13567879",
 *         specimen_no?:    "WEBQ65R9J6YX",
 *         mayo_patient_id?: "1CJ55X3RW",
 *         patient_name:    "LAWSON, TERESA",
 *         test_id:         "FFIG2",
 *         cpt?:            "83520",
 *         description?:    "IGF-2",
 *         charge_usd:      104.90
 *       }, ...
 *     ]
 *   }
 *
 * After insert, we run auto-match against name + collection-date and
 * stamp order_id for the unambiguous cases. Ambiguous / no-hit lines
 * stay unmatched for Mike to drag-drop.
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

  let body: {
    invoice_number?: string;
    invoice_date?: string;
    total_usd?: number;
    source_filename?: string;
    lines?: Array<{
      collection_date?: string;
      accession_no?: string;
      specimen_no?: string;
      mayo_patient_id?: string;
      patient_name?: string;
      test_id?: string;
      cpt?: string;
      description?: string;
      charge_usd?: number;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.invoice_number || !body.invoice_date || body.total_usd == null) {
    return NextResponse.json(
      { error: "invoice_number, invoice_date, total_usd required." },
      { status: 400 },
    );
  }
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "At least one line item required." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Upsert invoice header — repeat uploads of the same invoice number
  // replace the header but we do NOT wipe existing lines (that would
  // erase manual matches). Line inserts below use the unique key
  // (invoice_id, accession_no, test_id) so re-uploads are idempotent.
  const { data: existing } = await service
    .from("mayo_invoices")
    .select("id")
    .eq("invoice_number", body.invoice_number)
    .maybeSingle();

  let invoiceId: string;
  if (existing) {
    invoiceId = (existing as { id: string }).id;
    await service
      .from("mayo_invoices")
      .update({
        invoice_date: body.invoice_date,
        total_usd: body.total_usd,
        source_filename: body.source_filename ?? null,
        uploaded_by: account.email ?? user.email ?? null,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
  } else {
    const { data: created, error: insErr } = await service
      .from("mayo_invoices")
      .insert({
        invoice_number: body.invoice_number,
        invoice_date: body.invoice_date,
        total_usd: body.total_usd,
        source_filename: body.source_filename ?? null,
        uploaded_by: account.email ?? user.email ?? null,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return NextResponse.json(
        { error: `Failed to create invoice: ${insErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    invoiceId = (created as { id: string }).id;
  }

  // Validate each line and insert
  const rows: Array<{
    invoice_id: string;
    collection_date: string;
    accession_no: string;
    specimen_no: string | null;
    mayo_patient_id: string | null;
    patient_name: string;
    test_id: string;
    cpt: string | null;
    description: string | null;
    charge_usd: number;
  }> = [];
  const errors: string[] = [];
  for (const [i, l] of lines.entries()) {
    if (
      !l.collection_date ||
      !l.accession_no ||
      !l.patient_name ||
      !l.test_id ||
      l.charge_usd == null
    ) {
      errors.push(
        `line ${i + 1}: collection_date, accession_no, patient_name, test_id, charge_usd required`,
      );
      continue;
    }
    rows.push({
      invoice_id: invoiceId,
      collection_date: l.collection_date,
      accession_no: l.accession_no,
      specimen_no: l.specimen_no ?? null,
      mayo_patient_id: l.mayo_patient_id ?? null,
      patient_name: l.patient_name,
      test_id: l.test_id,
      cpt: l.cpt ?? null,
      description: l.description ?? null,
      charge_usd: l.charge_usd,
    });
  }
  if (errors.length > 0) {
    return NextResponse.json(
      { error: `Validation failed: ${errors.join("; ")}` },
      { status: 400 },
    );
  }

  const { error: upsertErr } = await service
    .from("mayo_invoice_lines")
    .upsert(rows, { onConflict: "invoice_id,accession_no,test_id" });
  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to save lines: ${upsertErr.message}` },
      { status: 500 },
    );
  }

  // Auto-match pass, grouped by accession — every line on the same
  // accession shares patient + collection date, so scoring once per
  // accession (with the full test basket for that accession) beats
  // scoring each line in isolation.
  const stats = await runAutoMatchForInvoice(service, invoiceId);

  return NextResponse.json({
    ok: true,
    invoice_id: invoiceId,
    lines_upserted: rows.length,
    auto_matched: stats.autoMatched,
    unmatched: stats.unmatched,
  });
}

/**
 * Grouped auto-matcher — the shared engine used by both the JSON /
 * PDF upload routes and the /rematch endpoint. Groups unmatched
 * lines by accession, calls candidatesForLine with the accession's
 * full test-description basket, and stamps every line on the
 * accession with the winning order_id.
 */
export async function runAutoMatchForInvoice(
  service: SupabaseClient,
  invoiceId: string,
): Promise<{ autoMatched: number; unmatched: number }> {
  const { data: unmatchedRaw } = await service
    .from("mayo_invoice_lines")
    .select(
      "id, accession_no, specimen_no, mayo_patient_id, patient_name, collection_date, description, test_id",
    )
    .eq("invoice_id", invoiceId)
    .is("order_id", null);
  const unmatched = (unmatchedRaw ?? []) as Array<{
    id: string;
    accession_no: string;
    specimen_no: string | null;
    mayo_patient_id: string | null;
    patient_name: string;
    collection_date: string;
    description: string | null;
    test_id: string;
  }>;

  // Group by accession
  const groups = new Map<
    string,
    {
      patient_name: string;
      collection_date: string;
      mayo_patient_id: string | null;
      specimen_no: string | null;
      lineIds: string[];
      descriptions: string[];
      testIds: string[];
    }
  >();
  for (const l of unmatched) {
    const g = groups.get(l.accession_no) ?? {
      patient_name: l.patient_name,
      collection_date: l.collection_date,
      mayo_patient_id: l.mayo_patient_id,
      specimen_no: l.specimen_no,
      lineIds: [],
      descriptions: [],
      testIds: [],
    };
    g.lineIds.push(l.id);
    if (l.description) g.descriptions.push(l.description);
    if (l.test_id) g.testIds.push(l.test_id);
    groups.set(l.accession_no, g);
  }

  let matchedLines = 0;
  for (const [accession_no, g] of groups) {
    // PATH 1 — deterministic primary-key match. If any portal order
    // already has this accession / specimen / MRN stamped on it (from
    // a prior manual match that back-stamped, or historical Pipeline
    // 1 seeding), auto-match with total confidence.
    const pkOrderId = await findByPrimaryKeys(service, {
      mayo_ml_order_number: accession_no,
      mayo_order_number: g.specimen_no,
      mayo_patient_id: g.mayo_patient_id,
    });
    if (pkOrderId) {
      const { error } = await service
        .from("mayo_invoice_lines")
        .update({
          order_id: pkOrderId,
          matched_at: new Date().toISOString(),
          matched_by: "auto:pk",
        })
        .in("id", g.lineIds);
      if (!error) matchedLines += g.lineIds.length;
      continue;
    }

    // PATH 2 — scored candidates via name + date + SKU/name overlap.
    const cands = await candidatesForLine(service, {
      patient_name: g.patient_name,
      collection_date: g.collection_date,
      mayoTestDescriptions: g.descriptions,
      mayoTestIds: g.testIds,
    });
    const orderId = pickAutoMatch(cands);
    if (!orderId) continue;
    const { error } = await service
      .from("mayo_invoice_lines")
      .update({
        order_id: orderId,
        matched_at: new Date().toISOString(),
        matched_by: "auto",
      })
      .in("id", g.lineIds);
    if (!error) matchedLines += g.lineIds.length;
    // Back-stamp Mayo IDs onto the matched order + profile for
    // future runs (learning loop).
    await backstampMayoIds(service, orderId, {
      accession_no,
      specimen_no: g.specimen_no,
      mayo_patient_id: g.mayo_patient_id,
    });
  }
  return {
    autoMatched: matchedLines,
    unmatched: unmatched.length - matchedLines,
  };
}

/**
 * When we (or Mike) confirm an invoice-line → order match, stamp the
 * Mayo identifiers onto the order (and the linked patient profile,
 * if any) — but only when the fields are currently null. Never
 * overwrite existing values. This is the learning loop that turns
 * every match into a permanent auto-match key for next time.
 */
export async function backstampMayoIds(
  service: SupabaseClient,
  orderId: string,
  ids: {
    accession_no?: string | null;
    specimen_no?: string | null;
    mayo_patient_id?: string | null;
  },
): Promise<void> {
  const { data: current } = await service
    .from("orders")
    .select(
      "mayo_ml_order_number, mayo_order_number, mayo_patient_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  const cur = (current ?? {}) as {
    mayo_ml_order_number?: string | null;
    mayo_order_number?: string | null;
    mayo_patient_id?: string | null;
  };
  const patch: Record<string, string> = {};
  if (ids.accession_no && !cur.mayo_ml_order_number) {
    patch.mayo_ml_order_number = ids.accession_no;
  }
  if (ids.specimen_no && !cur.mayo_order_number) {
    patch.mayo_order_number = ids.specimen_no;
  }
  if (ids.mayo_patient_id && !cur.mayo_patient_id) {
    patch.mayo_patient_id = ids.mayo_patient_id;
  }
  if (Object.keys(patch).length > 0) {
    await service.from("orders").update(patch).eq("id", orderId);
  }

  // Also stamp the profile — this is what unlocks fast auto-matching
  // for the patient's NEXT invoice regardless of which specific order.
  if (ids.mayo_patient_id) {
    const { data: lines } = await service
      .from("order_lines")
      .select("profile_id")
      .eq("order_id", orderId)
      .eq("line_type", "test")
      .limit(50);
    const profileIds = [
      ...new Set(
        ((lines ?? []) as Array<{ profile_id: string | null }>)
          .map((l) => l.profile_id)
          .filter((p): p is string => Boolean(p)),
      ),
    ];
    for (const pid of profileIds) {
      // Only stamp if profile currently has no MRN — don't overwrite.
      await service
        .from("patient_profiles")
        .update({ mayo_patient_id: ids.mayo_patient_id })
        .eq("id", pid)
        .is("mayo_patient_id", null);
    }
  }
}
