import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { parseBatchSheet, type BatchRow } from "@/lib/mayo/parse-batch-sheet";
import type { Account } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/mayo/batch-sheet/parse
 *
 * multipart/form-data: file=<Mayo batch sheet PDF>
 *
 * Parses the PDF, matches each patient row to a portal order using
 * (in order): orders.mayo_order_number = WEB, orders.mayo_ml_order_number
 * = ML, orders.mayo_patient_id = MRN. Returns rows enriched with the
 * matched order id / patient name / status / current tracking number
 * so the client can render the confirmation table.
 *
 * Dry run only — no writes. Caller pipes the resulting order_ids +
 * a tracking number into /api/orders/ship to actually assign.
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
    .select("role")
    .eq("id", user.id)
    .single()) as { data: Pick<Account, "role"> | null };
  if (account?.role !== "admin") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No `file` field in the upload." },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only .pdf files accepted." },
      { status: 400 },
    );
  }

  let parsed: {
    batches: string[];
    rows: BatchRow[];
    warnings: string[];
  };
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = await parseBatchSheet(buf);
  } catch (err) {
    return NextResponse.json(
      { error: `Batch sheet parse failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Collect all identifier candidates for a single batched query.
  const webCodes = [
    ...new Set(parsed.rows.map((r) => r.order_no).filter(Boolean)),
  ];
  const mlCodes = [
    ...new Set(
      parsed.rows
        .map((r) => r.ml_accession)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const mrnCodes = [
    ...new Set(
      parsed.rows
        .map((r) => r.mayo_patient_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  // Lookup by WEB first (most specific → one order = one accession).
  interface OrderHit {
    id: string;
    status: string;
    total_cad: number | null;
    fedex_tracking_number: string | null;
    shipped_at: string | null;
    mayo_order_number: string | null;
    mayo_ml_order_number: string | null;
    mayo_patient_id: string | null;
  }

  const hits = new Map<string, OrderHit>();
  async function fetchBy(column: string, values: string[]) {
    if (values.length === 0) return;
    const { data } = await service
      .from("orders")
      .select(
        "id, status, total_cad, fedex_tracking_number, shipped_at, mayo_order_number, mayo_ml_order_number, mayo_patient_id",
      )
      .in(column, values);
    for (const o of (data ?? []) as OrderHit[]) hits.set(o.id, o);
  }
  await fetchBy("mayo_order_number", webCodes);
  await fetchBy("mayo_ml_order_number", mlCodes);
  await fetchBy("mayo_patient_id", mrnCodes);

  // For each parsed row, pick the first matching order by preference
  // WEB > ML > MRN. Fetch patient name via patient_profiles join for
  // the matched orders (single extra query keeps the response light).
  interface EnrichedRow {
    batch_no: string;
    order_no: string;
    ml_accession: string | null;
    mayo_patient_id: string | null;
    patient_name_on_sheet: string | null;
    collected_at: string | null;
    order_id: string | null;
    match_key: "web" | "ml" | "mrn" | null;
    order_status: string | null;
    order_total_cad: number | null;
    order_tracking_number: string | null;
    order_shipped_at: string | null;
    portal_patient_name: string | null;
  }

  const enriched: EnrichedRow[] = parsed.rows.map((r) => {
    let matched: OrderHit | null = null;
    let key: "web" | "ml" | "mrn" | null = null;
    for (const o of hits.values()) {
      if (r.order_no && o.mayo_order_number === r.order_no) {
        matched = o;
        key = "web";
        break;
      }
    }
    if (!matched) {
      for (const o of hits.values()) {
        if (r.ml_accession && o.mayo_ml_order_number === r.ml_accession) {
          matched = o;
          key = "ml";
          break;
        }
      }
    }
    if (!matched) {
      for (const o of hits.values()) {
        if (r.mayo_patient_id && o.mayo_patient_id === r.mayo_patient_id) {
          matched = o;
          key = "mrn";
          break;
        }
      }
    }
    return {
      batch_no: r.batch_no,
      order_no: r.order_no,
      ml_accession: r.ml_accession,
      mayo_patient_id: r.mayo_patient_id,
      patient_name_on_sheet: r.patient_name,
      collected_at: r.collected_at,
      order_id: matched?.id ?? null,
      match_key: key,
      order_status: matched?.status ?? null,
      order_total_cad: matched?.total_cad ?? null,
      order_tracking_number: matched?.fedex_tracking_number ?? null,
      order_shipped_at: matched?.shipped_at ?? null,
      portal_patient_name: null,
    };
  });

  // Enrich portal patient name for the matched orders (single query)
  const matchedIds = enriched
    .map((r) => r.order_id)
    .filter((v): v is string => Boolean(v));
  if (matchedIds.length > 0) {
    const { data: linesRaw } = await service
      .from("order_lines")
      .select(
        "order_id, profile:patient_profiles(first_name, last_name, is_primary)",
      )
      .in("order_id", matchedIds)
      .eq("line_type", "test");
    interface JoinRow {
      order_id: string;
      profile: {
        first_name: string;
        last_name: string;
        is_primary: boolean;
      } | null;
    }
    const nameByOrder = new Map<string, string>();
    for (const l of (linesRaw ?? []) as unknown as JoinRow[]) {
      if (!l.profile) continue;
      const label = `${l.profile.first_name} ${l.profile.last_name}`;
      // Prefer the primary profile; otherwise keep the first non-null.
      if (l.profile.is_primary || !nameByOrder.has(l.order_id)) {
        nameByOrder.set(l.order_id, label);
      }
    }
    for (const r of enriched) {
      if (r.order_id) r.portal_patient_name = nameByOrder.get(r.order_id) ?? null;
    }
  }

  const matched = enriched.filter((r) => r.order_id).length;
  return NextResponse.json({
    ok: true,
    batches: parsed.batches,
    rows: enriched,
    matched,
    unmatched: enriched.length - matched,
    warnings: parsed.warnings,
  });
}
