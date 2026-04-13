import { createServiceRoleClient } from "@/lib/supabase/server";
import { AdminResultsManager } from "@/components/admin/AdminResultsManager";
import { Upload, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export type MayoTest = {
  name: string;
  specimenType: string | null;
};

export type OrderResult = {
  id: string;
  storage_path: string;
  file_name: string;
  result_status: "partial" | "final";
  uploaded_at: string;
  lab_reference_number: string | null;
} | null;

export type PendingOrder = {
  orderId: string;
  orderIdShort: string;
  createdAt: string;
  patientName: string;
  patientEmail: string;
  accountId: string;
  mayoTests: MayoTest[];
  existingResult: OrderResult;
};

const MAYO_LAB_NAME = "Mayo Clinic Laboratories";

export default async function AdminResultsUploadPage() {
  const service = createServiceRoleClient();

  // Fetch all orders with their lines + lab info + existing results
  const { data: ordersRaw } = await service
    .from("orders")
    .select(
      `
      id, status, created_at, account_id,
      account:accounts(email),
      order_lines(
        test:tests(name, specimen_type, lab:labs(name)),
        profile:patient_profiles(first_name, last_name, is_primary)
      ),
      results(id, storage_path, file_name, result_status, uploaded_at, lab_reference_number)
    `
    )
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  type RawOrder = {
    id: string;
    status: string;
    created_at: string;
    account_id: string | null;
    account: { email: string | null } | null;
    order_lines: Array<{
      test: {
        name: string;
        specimen_type: string | null;
        lab: { name: string } | null;
      } | null;
      profile: {
        first_name: string;
        last_name: string;
        is_primary: boolean;
      } | null;
    }>;
    results: Array<{
      id: string;
      storage_path: string;
      file_name: string;
      result_status: string;
      uploaded_at: string;
      lab_reference_number: string | null;
    }>;
  };

  const orders = (ordersRaw ?? []) as unknown as RawOrder[];

  // Filter to orders with at least one Mayo test
  const pendingOrders: PendingOrder[] = [];

  for (const order of orders) {
    const mayoTests: MayoTest[] = [];

    for (const line of order.order_lines) {
      const lab = Array.isArray(line.test?.lab)
        ? line.test?.lab[0]
        : line.test?.lab;
      if (lab?.name === MAYO_LAB_NAME && line.test) {
        mayoTests.push({
          name: line.test.name,
          specimenType: line.test.specimen_type,
        });
      }
    }

    if (mayoTests.length === 0) continue;

    // Find the primary profile name
    const primaryProfile = order.order_lines
      .map((l) => l.profile)
      .find((p) => p?.is_primary);
    const patientName = primaryProfile
      ? `${primaryProfile.first_name} ${primaryProfile.last_name}`
      : (order.account?.email ?? "Unknown");

    const existingResult =
      order.results.length > 0
        ? {
            id: order.results[0].id,
            storage_path: order.results[0].storage_path,
            file_name: order.results[0].file_name,
            result_status: order.results[0].result_status as
              | "partial"
              | "final",
            uploaded_at: order.results[0].uploaded_at,
            lab_reference_number:
              order.results[0].lab_reference_number,
          }
        : null;

    pendingOrders.push({
      orderId: order.id,
      orderIdShort: order.id.slice(0, 8).toUpperCase(),
      createdAt: order.created_at,
      patientName,
      patientEmail: order.account?.email ?? "—",
      accountId: order.account_id ?? "",
      mayoTests,
      existingResult,
    });
  }

  const pendingCount = pendingOrders.filter(
    (o) => !o.existingResult
  ).length;
  const partialCount = pendingOrders.filter(
    (o) => o.existingResult?.result_status === "partial"
  ).length;

  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
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
          Upload PDFs for Mayo Clinic orders. One PDF per order covering
          all tests.
        </p>
      </div>

      {/* Status counts */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div
          className="flex items-center gap-3 rounded-xl border px-5 py-3"
          style={{
            backgroundColor: "#1a3d22",
            borderColor: pendingCount > 0 ? "#c4973a" : "#2d6b35",
          }}
        >
          <Upload
            className="w-5 h-5"
            style={{ color: pendingCount > 0 ? "#c4973a" : "#8dc63f" }}
          />
          <div>
            <p
              className="text-xl font-semibold"
              style={{
                color: pendingCount > 0 ? "#c4973a" : "#ffffff",
              }}
            >
              {pendingCount}
            </p>
            <p className="text-xs" style={{ color: "#e8d5a3" }}>
              orders pending upload
            </p>
          </div>
        </div>

        {partialCount > 0 && (
          <div
            className="flex items-center gap-3 rounded-xl border px-5 py-3"
            style={{
              backgroundColor: "#1a3d22",
              borderColor: "#c4973a",
            }}
          >
            <Clock className="w-5 h-5" style={{ color: "#c4973a" }} />
            <div>
              <p
                className="text-xl font-semibold"
                style={{ color: "#c4973a" }}
              >
                {partialCount}
              </p>
              <p className="text-xs" style={{ color: "#e8d5a3" }}>
                orders with partial results
              </p>
            </div>
          </div>
        )}
      </div>

      <AdminResultsManager orders={pendingOrders} />
    </div>
  );
}
