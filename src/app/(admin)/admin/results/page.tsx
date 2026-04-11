import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { ResultUploader } from "@/components/ResultUploader";
import { CheckCircle, FlaskConical } from "lucide-react";
import type { Account } from "@/types/database";

type OrderLineRow = {
  id: string;
  created_at: string;
  profile_id: string;
  order: {
    id: string;
    status: string;
    created_at: string;
    account: { email: string } | null;
  } | null;
  test: { name: string; turnaround_display: string | null; lab: { name: string } } | null;
  profile: { first_name: string; last_name: string } | null;
  result: Array<{ id: string }>;
};

export default async function AdminResultsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: accountRaw } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  const account = accountRaw as Pick<Account, "role"> | null;

  if (!account || account.role !== "admin") redirect("/portal");

  const { data: orderLinesRaw } = await supabase
    .from("order_lines")
    .select(`
      id, created_at, profile_id,
      order:orders(id, status, created_at, account:accounts(email)),
      test:tests(name, turnaround_display, lab:labs(name)),
      profile:patient_profiles(first_name, last_name),
      result:results(id)
    `)
    .order("created_at", { ascending: false });
  const orderLines = (orderLinesRaw ?? []) as unknown as OrderLineRow[];

  const pendingLines = orderLines.filter((ol) => ol.result.length === 0);
  const uploadedLines = orderLines.filter((ol) => ol.result.length > 0);

  const pendingByOrder = new Map<
    string,
    {
      orderInfo: { id: string; status: string; email: string; created_at: string };
      lines: OrderLineRow[];
    }
  >();

  for (const line of pendingLines) {
    if (!line.order) continue;
    const orderId = line.order.id;

    if (!pendingByOrder.has(orderId)) {
      pendingByOrder.set(orderId, {
        orderInfo: {
          id: orderId,
          status: line.order.status,
          email: line.order.account?.email ?? "Unknown",
          created_at: line.order.created_at,
        },
        lines: [],
      });
    }
    pendingByOrder.get(orderId)!.lines.push(line);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
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
          Upload PDFs for completed order lines. Patients are notified automatically
          by email and SMS.
        </p>
      </div>

      <div className="mb-8">
        <h2
          className="font-heading text-xl font-semibold mb-4"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Awaiting Upload ({pendingLines.length})
        </h2>

        {pendingLines.length === 0 ? (
          <div
            className="rounded-xl border px-6 py-12 text-center"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <CheckCircle
              className="w-10 h-10 mx-auto mb-3"
              style={{ color: "#8dc63f" }}
            />
            <p style={{ color: "#e8d5a3" }}>All order lines have results uploaded.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(pendingByOrder.entries()).map(
              ([orderId, { orderInfo, lines }]) => (
                <div
                  key={orderId}
                  className="rounded-xl border overflow-hidden"
                  style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
                >
                  <div
                    className="px-6 py-4 border-b"
                    style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-xs"
                        style={{ color: "#6ab04c" }}
                      >
                        Order #{orderInfo.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border capitalize"
                        style={{
                          backgroundColor: "rgba(59, 130, 246, 0.125)",
                          color: "#93c5fd",
                          borderColor: "#3b82f6",
                        }}
                      >
                        {orderInfo.status}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                      {orderInfo.email} · {formatDate(orderInfo.created_at)}
                    </p>
                  </div>

                  <div>
                    {lines.map((line, idx) => (
                      <div
                        key={line.id}
                        className="px-6 py-5"
                        style={{
                          borderTop: idx > 0 ? "1px solid #2d6b35" : "none",
                        }}
                      >
                        <div className="flex items-start gap-3 mb-4">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
                            style={{
                              backgroundColor: "#0f2614",
                              borderColor: "#2d6b35",
                            }}
                          >
                            <FlaskConical
                              className="w-4 h-4"
                              style={{ color: "#8dc63f" }}
                            />
                          </div>
                          <div>
                            <p
                              className="font-medium text-sm"
                              style={{ color: "#ffffff" }}
                            >
                              {line.test?.name ?? "Unknown Test"}
                            </p>
                            <p
                              className="text-xs mt-0.5"
                              style={{ color: "#6ab04c" }}
                            >
                              {line.test?.lab?.name}
                              {line.profile && (
                                <span>
                                  {" "}
                                  · For: {line.profile.first_name}{" "}
                                  {line.profile.last_name}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <ResultUploader
                          orderLineId={line.id}
                          profileId={line.profile_id}
                          testName={line.test?.name ?? "Test"}
                          patientName={
                            line.profile
                              ? `${line.profile.first_name} ${line.profile.last_name}`
                              : "Patient"
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {uploadedLines.length > 0 && (
        <div>
          <h2
            className="font-heading text-xl font-semibold mb-4"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Recently Uploaded ({uploadedLines.length})
          </h2>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
                >
                  <th
                    className="px-6 py-3 text-left text-xs font-medium uppercase"
                    style={{ color: "#6ab04c" }}
                  >
                    Patient
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium uppercase"
                    style={{ color: "#6ab04c" }}
                  >
                    Test
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium uppercase"
                    style={{ color: "#6ab04c" }}
                  >
                    Lab
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium uppercase"
                    style={{ color: "#6ab04c" }}
                  >
                    Order Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {uploadedLines.slice(0, 20).map((line, idx) => (
                  <tr
                    key={line.id}
                    style={{
                      borderTop: idx > 0 ? "1px solid #2d6b35" : "none",
                    }}
                  >
                    <td className="px-6 py-3" style={{ color: "#ffffff" }}>
                      {line.profile
                        ? `${line.profile.first_name} ${line.profile.last_name}`
                        : "—"}
                    </td>
                    <td className="px-6 py-3" style={{ color: "#e8d5a3" }}>
                      {line.test?.name ?? "—"}
                    </td>
                    <td className="px-6 py-3" style={{ color: "#6ab04c" }}>
                      {line.test?.lab?.name ?? "—"}
                    </td>
                    <td
                      className="px-6 py-3 text-right text-xs whitespace-nowrap"
                      style={{ color: "#6ab04c" }}
                    >
                      {formatDate(line.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
