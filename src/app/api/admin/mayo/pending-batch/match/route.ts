import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { matchOrderToPortal } from "@/lib/mayo/matchOrderToPortal";
import { createSupabaseMatchRepo } from "@/lib/mayo/supabaseMatchRepo";
import type {
  ParsedPendingBatchRow,
} from "@/lib/mayo/parsePendingBatchCsv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostBody {
  rows: ParsedPendingBatchRow[];
}

interface TriageRow {
  csv_row: ParsedPendingBatchRow;
  confidence: "exact" | "high" | "medium" | "low" | "none";
  primary_match: {
    order_id: string;
    profile_id: string;
    score: number;
    reasoning: string;
    portal_order_short_id: string;
    portal_profile_label: string | null;
    already_stamped: boolean;
  } | null;
  alternatives: Array<{
    order_id: string;
    profile_id: string;
    score: number;
    reasoning: string;
    portal_order_short_id: string;
  }>;
  issues: string[];
}

/**
 * POST /api/admin/mayo/pending-batch/match
 *
 * Stateless — takes the parsed CSV rows (the client parsed them in
 * the browser via parsePendingBatchCsv) and runs each through the
 * matching engine. No DB writes happen here; the caller invokes
 * /accept per row (or in bulk) once admin reviews the triage.
 *
 * Admin-only.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: callerRaw } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((callerRaw as { role?: string } | null)?.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden — admin only" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as PostBody | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json(
      { error: "rows[] required" },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const repo = createSupabaseMatchRepo(service);

  // For display: resolve order short ids + profile labels once we
  // know the matched ids. We collect ids across all rows, then
  // batch-fetch labels in one round-trip per table.
  const triageRaw: Array<{
    csv_row: ParsedPendingBatchRow;
    confidence: TriageRow["confidence"];
    primary_match: {
      order_id: string;
      profile_id: string;
      score: number;
      reasoning: string;
    } | null;
    alternatives: Array<{
      order_id: string;
      profile_id: string;
      score: number;
      reasoning: string;
    }>;
    issues: string[];
  }> = [];

  for (const row of body.rows) {
    const result = await matchOrderToPortal(
      {
        first_name: row.first_name,
        last_name: row.last_name,
        date_of_birth: row.date_of_birth,
        test_skus: row.tests.map((t) => t.sku),
        mayo_order_number: row.mayo_order_number || null,
        mayo_patient_id: row.mayo_patient_id || null,
        collection_date: row.collection_date,
      },
      repo,
    );
    triageRaw.push({
      csv_row: row,
      confidence: result.confidence,
      primary_match: result.primary_match,
      alternatives: result.alternatives,
      issues: result.issues,
    });
  }

  // Gather candidate ids.
  const orderIds = new Set<string>();
  const profileIds = new Set<string>();
  for (const t of triageRaw) {
    if (t.primary_match) {
      orderIds.add(t.primary_match.order_id);
      if (t.primary_match.profile_id) profileIds.add(t.primary_match.profile_id);
    }
    for (const alt of t.alternatives) {
      orderIds.add(alt.order_id);
    }
  }

  const orderShortLabels = new Map<string, { short: string; mayoOrderNumber: string | null }>();
  if (orderIds.size > 0) {
    const { data: orders } = await service
      .from("orders")
      .select("id, mayo_order_number")
      .in("id", [...orderIds]);
    for (const o of (orders ?? []) as Array<{
      id: string;
      mayo_order_number: string | null;
    }>) {
      orderShortLabels.set(o.id, {
        short: o.id.slice(0, 8).toUpperCase(),
        mayoOrderNumber: o.mayo_order_number,
      });
    }
  }

  const profileLabels = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profs } = await service
      .from("patient_profiles")
      .select("id, first_name, last_name")
      .in("id", [...profileIds]);
    for (const p of (profs ?? []) as Array<{
      id: string;
      first_name: string;
      last_name: string;
    }>) {
      profileLabels.set(p.id, `${p.first_name} ${p.last_name}`);
    }
  }

  const triage: TriageRow[] = triageRaw.map((t) => {
    if (!t.primary_match) {
      return {
        csv_row: t.csv_row,
        confidence: t.confidence,
        primary_match: null,
        alternatives: t.alternatives.map((a) => ({
          order_id: a.order_id,
          profile_id: a.profile_id,
          score: a.score,
          reasoning: a.reasoning,
          portal_order_short_id:
            orderShortLabels.get(a.order_id)?.short ?? a.order_id.slice(0, 8),
        })),
        issues: t.issues,
      };
    }
    const orderInfo = orderShortLabels.get(t.primary_match.order_id);
    return {
      csv_row: t.csv_row,
      confidence: t.confidence,
      primary_match: {
        ...t.primary_match,
        portal_order_short_id:
          orderInfo?.short ?? t.primary_match.order_id.slice(0, 8),
        portal_profile_label: profileLabels.get(t.primary_match.profile_id) ?? null,
        // 'exact' confidence + already-stamped means re-import; the
        // UI uses this to render an "Already stamped" pill and
        // disable the Accept button.
        already_stamped:
          t.confidence === "exact" &&
          orderInfo?.mayoOrderNumber === t.csv_row.mayo_order_number,
      },
      alternatives: t.alternatives.map((a) => ({
        order_id: a.order_id,
        profile_id: a.profile_id,
        score: a.score,
        reasoning: a.reasoning,
        portal_order_short_id:
          orderShortLabels.get(a.order_id)?.short ?? a.order_id.slice(0, 8),
      })),
      issues: t.issues,
    };
  });

  return NextResponse.json({ triage });
}
