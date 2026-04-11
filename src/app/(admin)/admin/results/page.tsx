import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrderLineIdsWithResults } from "@/lib/admin-stats";
import { ResultsUploadManager } from "@/components/admin/ResultsUploadManager";
import { CheckCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export type PendingOrderLine = {
  id: string;
  profileId: string;
  testName: string;
  labName: string;
  labResultsVisibility: "full" | "partial" | "none";
  profileName: string;
  /** e.g. "Spouse of Mike Johnson" — null for the account holder. */
  relationshipLabel: string | null;
  specimenType: string | null;
  turnaroundDisplay: string | null;
};

export type PendingOrderGroup = {
  orderId: string;
  orderIdShort: string;
  createdAt: string;
  patientEmail: string;
  primaryPatientName: string;
  lines: PendingOrderLine[];
};

export default async function AdminResultsUploadPage() {
  const service = createServiceRoleClient();

  // Fetch all order lines with full context, then filter out ones that
  // already have results, cancelled orders, etc.
  const [{ data: orderLinesRaw }, resolvedLineIds] = await Promise.all([
    service
      .from("order_lines")
      .select(
        `
        id, profile_id, created_at,
        order:orders(
          id, status, created_at,
          account:accounts(id, email),
          order_lines(
            profile:patient_profiles(first_name, last_name, is_primary)
          )
        ),
        test:tests(
          name, specimen_type, turnaround_display,
          lab:labs(name, results_visibility)
        ),
        profile:patient_profiles(first_name, last_name, is_primary, relationship)
      `
      )
      .order("created_at", { ascending: false }),
    getOrderLineIdsWithResults(service),
  ]);

  type RawRow = {
    id: string;
    profile_id: string;
    created_at: string;
    order: {
      id: string;
      status: string;
      created_at: string;
      account: { id: string; email: string | null } | null;
      order_lines: Array<{
        profile: {
          first_name: string;
          last_name: string;
          is_primary: boolean;
        } | null;
      }>;
    } | null;
    test: {
      name: string;
      specimen_type: string | null;
      turnaround_display: string | null;
      lab: { name: string; results_visibility: string } | null;
    } | null;
    profile: {
      first_name: string;
      last_name: string;
      is_primary: boolean;
      relationship: string | null;
    } | null;
  };

  const allOrderLines = (orderLinesRaw ?? []) as unknown as RawRow[];

  // Filter to pending lines: no result yet, parent order not cancelled
  const pendingRows = allOrderLines.filter((row) => {
    if (!row.order) return false;
    if (row.order.status === "cancelled") return false;
    if (resolvedLineIds.has(row.id)) return false;
    return true;
  });

  // Group by order_id
  const groupMap = new Map<string, PendingOrderGroup>();

  for (const row of pendingRows) {
    if (!row.order) continue;

    const orderId = row.order.id;

    if (!groupMap.has(orderId)) {
      // Find the primary patient profile for this order (first line with is_primary, otherwise first)
      const orderProfiles = row.order.order_lines
        .map((l) => l.profile)
        .filter((p): p is NonNullable<typeof p> => p !== null);
      const primary =
        orderProfiles.find((p) => p.is_primary) ?? orderProfiles[0];
      const primaryName = primary
        ? `${primary.first_name} ${primary.last_name}`
        : (row.order.account?.email ?? "Unknown patient");

      groupMap.set(orderId, {
        orderId,
        orderIdShort: orderId.slice(0, 8).toUpperCase(),
        createdAt: row.order.created_at,
        patientEmail: row.order.account?.email ?? "—",
        primaryPatientName: primaryName,
        lines: [],
      });
    }

    const group = groupMap.get(orderId)!;
    const profileName = row.profile
      ? `${row.profile.first_name} ${row.profile.last_name}`
      : "Unknown";

    // Build a "Spouse of Mike Johnson" label so the admin knows whose
    // result they're uploading without ambiguity. Account holders get
    // null and render as "Account holder".
    let relationshipLabel: string | null = null;
    if (row.profile && !row.profile.is_primary && row.profile.relationship) {
      const accountHolder = row.order?.order_lines
        .map((l) => l.profile)
        .find((p) => p?.is_primary);
      const accountHolderName = accountHolder
        ? `${accountHolder.first_name} ${accountHolder.last_name}`
        : "account holder";
      relationshipLabel = `${formatRelationship(row.profile.relationship)} of ${accountHolderName}`;
    }

    const labVisibility =
      (row.test?.lab?.results_visibility as "full" | "partial" | "none" | undefined) ??
      "full";

    group.lines.push({
      id: row.id,
      profileId: row.profile_id,
      testName: row.test?.name ?? "Unknown test",
      labName: row.test?.lab?.name ?? "—",
      labResultsVisibility: labVisibility,
      profileName,
      relationshipLabel,
      specimenType: row.test?.specimen_type ?? null,
      turnaroundDisplay: row.test?.turnaround_display ?? null,
    });
  }

  function formatRelationship(rel: string): string {
    switch (rel) {
      case "spouse_partner":
        return "Spouse";
      case "child":
        return "Child";
      case "parent":
        return "Parent";
      case "sibling":
        return "Sibling";
      case "friend":
        return "Friend";
      case "colleague":
        return "Colleague";
      default:
        return "Other";
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );

  const pendingCount = pendingRows.length;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Upload Lab <span style={{ color: "#c4973a" }}>Results</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Upload PDFs for completed order lines. Patients are notified
          automatically by email and SMS.
        </p>
      </div>

      {/* Pending summary */}
      <div
        className="flex items-center gap-4 rounded-xl border px-5 py-4 mb-6"
        style={{
          backgroundColor: "#1a3d22",
          borderColor: pendingCount > 0 ? "#c4973a" : "#2d6b35",
        }}
      >
        {pendingCount > 0 ? (
          <>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center border shrink-0"
              style={{
                backgroundColor: "#0f2614",
                borderColor: "#c4973a",
              }}
            >
              <span
                className="text-lg font-bold"
                style={{ color: "#c4973a" }}
              >
                {pendingCount}
              </span>
            </div>
            <p style={{ color: "#c4973a", fontWeight: 600 }}>
              {pendingCount === 1
                ? "1 result pending upload"
                : `${pendingCount} results pending upload`}
            </p>
          </>
        ) : (
          <>
            <CheckCircle
              className="w-6 h-6 shrink-0"
              style={{ color: "#8dc63f" }}
            />
            <p style={{ color: "#e8d5a3" }}>
              All caught up — no results pending upload.
            </p>
          </>
        )}
      </div>

      <ResultsUploadManager initialGroups={groups} />
    </div>
  );
}
