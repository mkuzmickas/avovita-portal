import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { splitMayoName } from "@/lib/mayo/match-candidates";
import type { Account } from "@/types/database";

export const runtime = "nodejs";

/**
 * GET /api/admin/mayo/invoices/[id]/debug-line?line_id=<uuid>
 *
 * Diagnostic endpoint that walks the matcher steps for one Mayo
 * invoice line and returns everything the auto-matcher sees:
 *
 *   1. The parsed (last, first) from the invoice's patient_name
 *   2. patient_profiles the last-name query returned (strict + fallback)
 *   3. account_ids derived from those profiles
 *   4. Every order on those accounts (with all four date columns +
 *      created_at) so we can see WHY the date-window filter picked
 *      or rejected each one
 *   5. Which orders survived the ±35d/+5d window (using the same
 *      anchor precedence as the real matcher)
 *
 * Use this when a line you *know* has a portal order is showing as
 * "no candidates" in the matcher UI.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const url = new URL(request.url);
  const lineId = url.searchParams.get("line_id");
  const { id: invoiceId } = await params;
  if (!lineId) {
    return NextResponse.json(
      { error: "line_id query param required." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  // Pull the invoice line
  const { data: lineRaw } = await service
    .from("mayo_invoice_lines")
    .select(
      "id, invoice_id, accession_no, patient_name, collection_date, description, mayo_patient_id",
    )
    .eq("id", lineId)
    .maybeSingle();
  if (!lineRaw) {
    return NextResponse.json({ error: "Line not found." }, { status: 404 });
  }
  const line = lineRaw as unknown as {
    id: string;
    invoice_id: string;
    accession_no: string;
    patient_name: string;
    collection_date: string;
    description: string | null;
    mayo_patient_id: string | null;
  };
  if (line.invoice_id !== invoiceId) {
    return NextResponse.json(
      { error: "Line does not belong to this invoice." },
      { status: 400 },
    );
  }

  const { last, first } = splitMayoName(line.patient_name);

  // Strict last-name query
  const { data: strictRaw } = await service
    .from("patient_profiles")
    .select("id, account_id, first_name, last_name, date_of_birth")
    .ilike("last_name", last);
  const strict = strictRaw ?? [];

  // Substring fallback
  const { data: fallbackRaw } =
    last.length >= 4
      ? await service
          .from("patient_profiles")
          .select("id, account_id, first_name, last_name, date_of_birth")
          .ilike("last_name", `%${last}%`)
      : { data: [] };
  const fallback = fallbackRaw ?? [];

  const allProfiles = strict.length > 0 ? strict : fallback;
  const accountIds = [
    ...new Set(
      (allProfiles as Array<{ account_id: string }>).map((p) => p.account_id),
    ),
  ];

  // Every order on those accounts (regardless of window)
  const { data: allOrdersRaw } =
    accountIds.length > 0
      ? await service
          .from("orders")
          .select(
            "id, account_id, appointment_at, appointment_date, shipping_date, shipped_at, created_at, status",
          )
          .in("account_id", accountIds)
      : { data: [] };
  const allOrders = allOrdersRaw ?? [];

  const collectionDate = new Date(line.collection_date);
  const winStart = new Date(collectionDate);
  winStart.setDate(winStart.getDate() - 35);
  const winEnd = new Date(collectionDate);
  winEnd.setDate(winEnd.getDate() + 5);

  const ordersWithAnchor = (
    allOrders as Array<{
      id: string;
      account_id: string;
      appointment_at: string | null;
      appointment_date: string | null;
      shipping_date: string | null;
      shipped_at: string | null;
      created_at: string;
      status: string;
    }>
  ).map((o) => {
    const anchor =
      o.appointment_at ||
      o.appointment_date ||
      o.shipping_date ||
      o.shipped_at ||
      o.created_at;
    const anchorDate = anchor ? new Date(anchor) : null;
    const inWindow = anchorDate
      ? anchorDate >= winStart && anchorDate <= winEnd
      : false;
    const daysOff = anchorDate
      ? Math.round(
          (anchorDate.getTime() - collectionDate.getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : null;
    return { ...o, anchor, inWindow, daysOff };
  });

  return NextResponse.json({
    line: {
      id: line.id,
      accession_no: line.accession_no,
      patient_name: line.patient_name,
      parsed_last: last,
      parsed_first: first,
      collection_date: line.collection_date,
      description: line.description,
    },
    window: {
      start: winStart.toISOString().slice(0, 10),
      end: winEnd.toISOString().slice(0, 10),
    },
    profiles_strict_ilike: strict,
    profiles_substring_fallback:
      strict.length > 0 ? "(not used — strict returned rows)" : fallback,
    account_ids_derived: accountIds,
    all_orders_on_those_accounts: ordersWithAnchor,
    orders_in_window: ordersWithAnchor.filter((o) => o.inWindow),
  });
}
