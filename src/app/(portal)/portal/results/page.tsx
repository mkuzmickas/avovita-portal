import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { FileText, Clock, CheckCircle } from "lucide-react";
import { ViewResultButton } from "@/components/ViewResultButton";

export const dynamic = "force-dynamic";

type ResultRow = {
  id: string;
  order_id: string;
  storage_path: string;
  file_name: string;
  result_status: "partial" | "final";
  uploaded_at: string;
  viewed_at: string | null;
};

type OrderTestRow = {
  test: { name: string; lab: { name: string } | null } | null;
};

export default async function ResultsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/portal/results");

  // Fetch all results for this account's orders (order-level, not order_line)
  const { data: resultsRaw } = await supabase
    .from("results")
    .select(
      `
      id, order_id, storage_path, file_name, result_status,
      uploaded_at, viewed_at
    `
    )
    .order("uploaded_at", { ascending: false });

  // Filter out sentinel direct-delivery rows
  const results = ((resultsRaw ?? []) as unknown as ResultRow[]).filter(
    (r) => !r.storage_path.startsWith("__")
  );

  // Fetch the tests for each order so we can display them
  const orderIds = [...new Set(results.map((r) => r.order_id))];

  let orderTestsMap = new Map<string, Array<{ name: string; lab: string }>>();

  if (orderIds.length > 0) {
    const { data: orderLinesRaw } = await supabase
      .from("order_lines")
      .select("order_id, test:tests(name, lab:labs(name))")
      .in("order_id", orderIds);

    type OlRow = {
      order_id: string;
      test: { name: string; lab: { name: string } | { name: string }[] | null } | null;
    };
    const lines = (orderLinesRaw ?? []) as unknown as OlRow[];

    for (const line of lines) {
      if (!line.test?.name) continue;
      const lab = Array.isArray(line.test.lab)
        ? line.test.lab[0]
        : line.test.lab;
      const entry = { name: line.test.name, lab: lab?.name ?? "" };
      const existing = orderTestsMap.get(line.order_id) ?? [];
      existing.push(entry);
      orderTestsMap.set(line.order_id, existing);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          My <span style={{ color: "#c4973a" }}>Results</span>
        </h1>
        <p className="mt-1" style={{ color: "#e8d5a3" }}>
          Your lab results are delivered securely here.
        </p>
      </div>

      {results.length === 0 ? (
        <div
          className="rounded-xl border px-6 py-16 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <FileText
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "#2d6b35" }}
          />
          <p style={{ color: "#e8d5a3" }}>No results available yet.</p>
          <p className="text-sm mt-2" style={{ color: "#6ab04c" }}>
            Results will appear here once your specimens have been processed
            by the laboratory.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result) => {
            const tests = orderTestsMap.get(result.order_id) ?? [];
            const isNew = !result.viewed_at;
            const isPartial = result.result_status === "partial";

            return (
              <div
                key={result.id}
                className="rounded-xl border overflow-hidden"
                style={{
                  backgroundColor: "#1a3d22",
                  borderColor: isNew ? "#c4973a" : "#2d6b35",
                }}
              >
                <div className="px-5 sm:px-6 py-4 flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: "#0f2614",
                      borderColor: isNew ? "#c4973a" : "#2d6b35",
                    }}
                  >
                    <FileText
                      className="w-5 h-5"
                      style={{
                        color: isNew ? "#c4973a" : "#8dc63f",
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Status + date row */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {isNew && (
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded-full border"
                          style={{
                            backgroundColor: "rgba(196, 151, 58, 0.125)",
                            color: "#c4973a",
                            borderColor: "#c4973a",
                          }}
                        >
                          New
                        </span>
                      )}
                      <span
                        className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full border"
                        style={
                          isPartial
                            ? {
                                backgroundColor:
                                  "rgba(196, 151, 58, 0.125)",
                                color: "#c4973a",
                                borderColor: "#c4973a",
                              }
                            : {
                                backgroundColor:
                                  "rgba(141, 198, 63, 0.125)",
                                color: "#8dc63f",
                                borderColor: "#8dc63f",
                              }
                        }
                      >
                        {isPartial ? (
                          <>
                            <Clock className="w-3 h-3" />
                            Partial — more results may follow
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            Final
                          </>
                        )}
                      </span>
                    </div>

                    {/* Tests list */}
                    <ul className="space-y-0.5 mb-2">
                      {tests.map((t, i) => (
                        <li
                          key={i}
                          className="text-sm"
                          style={{ color: "#ffffff" }}
                        >
                          {t.name}
                          {t.lab && (
                            <span
                              className="text-xs ml-1.5"
                              style={{ color: "#6ab04c" }}
                            >
                              · {t.lab}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>

                    <p className="text-xs" style={{ color: "#6ab04c" }}>
                      Uploaded {formatDate(result.uploaded_at)}
                    </p>
                  </div>

                  <ViewResultButton
                    resultId={result.id}
                    storagePath={result.storage_path}
                    isNew={isNew}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
