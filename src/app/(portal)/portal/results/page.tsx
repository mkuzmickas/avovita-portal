import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import {
  FileText,
  Clock,
  CheckCircle,
  Mail,
  User,
  UserCheck,
} from "lucide-react";
import { ViewResultButton } from "@/components/ViewResultButton";
import { ResendConfirmationButton } from "@/components/portal/ResendConfirmationButton";
import { MyRecordsUpload } from "@/components/portal/MyRecordsUpload";
import { DeleteMyRecordButton } from "@/components/portal/DeleteMyRecordButton";
import { AiInterpretationButton } from "@/components/portal/AiInterpretationButton";
import { classifyResultRow } from "@/lib/results/classify";

export const dynamic = "force-dynamic";

type ResultRow = {
  id: string;
  order_id: string | null;
  storage_path: string;
  file_name: string;
  result_status: "partial" | "final";
  uploaded_at: string;
  viewed_at: string | null;
  /** Free-form. Classify via @/lib/results/classify (keys off order_id). */
  source: string | null;
  document_type: string | null;
  document_date: string | null;
  description: string | null;
};

const DOC_TYPE_LABEL: Record<string, string> = {
  lab_result: "Lab Result",
  imaging_report: "Imaging Report",
  specialist_report: "Specialist Report",
  medical_history: "Medical History",
  prescription: "Prescription",
  other: "Document",
};

export default async function ResultsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/portal/results");

  // Email confirmation gate — results are PHI; we don't show them until
  // the email is confirmed (the magic link from the order email or any
  // subsequent reminder will set this).
  if (!user.email_confirmed_at) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <div
          className="rounded-2xl border p-6 sm:p-8 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
            style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
          >
            <Mail className="w-7 h-7" style={{ color: "#c4973a" }} />
          </div>
          <h1
            className="font-heading text-2xl sm:text-3xl font-semibold mb-2"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Please confirm your <span style={{ color: "#c4973a" }}>email</span>
          </h1>
          <p className="text-sm mb-5 leading-relaxed" style={{ color: "#e8d5a3" }}>
            Please confirm your email address to view your results. Check your
            inbox or spam folder.
          </p>
          <ResendConfirmationButton />
        </div>
      </div>
    );
  }

  // Fetch every result row for this account (RLS limits it to the
  // current user's profiles). Includes source so we can render the three
  // variants differently.
  const { data: resultsRaw } = await supabase
    .from("results")
    .select(
      `
      id, order_id, storage_path, file_name, result_status,
      uploaded_at, viewed_at, source,
      document_type, document_date, description
    `
    )
    // Sort the column we expect to be populated for the most recent
    // (manual) uploads — order rows fall back to uploaded_at below.
    .order("uploaded_at", { ascending: false });

  // Filter out sentinel direct-delivery rows, then re-sort the customer
  // view by document_date (most recent first) using uploaded_at as the
  // fallback for rows where document_date is unset (every order row, and
  // any manual upload where the admin left it blank).
  const results = ((resultsRaw ?? []) as unknown as ResultRow[])
    .filter((r) => !r.storage_path.startsWith("__"))
    .sort((a, b) => {
      const ka = a.document_date ?? a.uploaded_at;
      const kb = b.document_date ?? b.uploaded_at;
      return kb.localeCompare(ka);
    });

  // Tests per order — only needed for order-attached rows (any row with
  // a non-null order_id). Don't trust the source string: production has
  // 'order_attached' on every order row, so source==='order' would miss
  // them all.
  const orderIds = [
    ...new Set(
      results
        .filter((r) => classifyResultRow(r) === "order" && r.order_id)
        .map((r) => r.order_id as string),
    ),
  ];
  const orderTestsMap = new Map<string, Array<{ name: string; lab: string }>>();
  if (orderIds.length > 0) {
    const { data: orderLinesRaw } = await supabase
      .from("order_lines")
      .select("order_id, test:tests(name, lab:labs(name))")
      .in("order_id", orderIds);

    type OlRow = {
      order_id: string;
      test: {
        name: string;
        lab: { name: string } | { name: string }[] | null;
      } | null;
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
          All your lab results — from AvoVita orders and your own uploads.
        </p>
      </div>

      <MyRecordsUpload />

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
            by the laboratory, or once you upload your own records above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            // Group order-attached PDFs by order_id so a batch of N
            // PDFs renders as ONE card (with N download buttons inside)
            // instead of N cards each repeating the order's test list.
            const groups = new Map<string, ResultRow[]>();
            const singles: ResultRow[] = [];
            for (const r of results) {
              if (classifyResultRow(r) === "order" && r.order_id) {
                const arr = groups.get(r.order_id) ?? [];
                arr.push(r);
                groups.set(r.order_id, arr);
              } else {
                singles.push(r);
              }
            }
            type Entry =
              | {
                  kind: "order";
                  key: string;
                  sortKey: string;
                  orderId: string;
                  items: ResultRow[];
                }
              | { kind: "single"; key: string; sortKey: string; item: ResultRow };
            const entries: Entry[] = [];
            for (const [orderId, items] of groups) {
              const sorted = [...items].sort((a, b) =>
                b.uploaded_at.localeCompare(a.uploaded_at),
              );
              entries.push({
                kind: "order",
                key: `order-${orderId}`,
                sortKey: sorted[0].uploaded_at,
                orderId,
                items: sorted,
              });
            }
            for (const r of singles) {
              entries.push({
                kind: "single",
                key: `single-${r.id}`,
                sortKey: r.document_date ?? r.uploaded_at,
                item: r,
              });
            }
            entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
            return entries.map((entry) =>
              entry.kind === "order" ? (
                <OrderResultCard
                  key={entry.key}
                  items={entry.items}
                  tests={orderTestsMap.get(entry.orderId) ?? []}
                />
              ) : (
                <UploadedResultCard key={entry.key} result={entry.item} />
              ),
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Order-attached result group (one card per order, N PDFs inside) ──

function OrderResultCard({
  items,
  tests,
}: {
  items: ResultRow[];
  tests: Array<{ name: string; lab: string }>;
}) {
  // Status precedence: any 'final' → Final; otherwise → Partial.
  // "New" if at least one PDF in the group hasn't been viewed yet.
  const isPartial = !items.some((r) => r.result_status === "final");
  const isNew = items.some((r) => !r.viewed_at);
  const newestUploadedAt = items[0]?.uploaded_at;

  return (
    <div
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
            style={{ color: isNew ? "#c4973a" : "#8dc63f" }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {isNew && <Badge color="#c4973a" text="New" />}
            <Badge
              color={isPartial ? "#c4973a" : "#8dc63f"}
              icon={
                isPartial ? (
                  <Clock className="w-3 h-3" />
                ) : (
                  <CheckCircle className="w-3 h-3" />
                )
              }
              text={
                isPartial ? "Partial — additional results may follow" : "Final"
              }
            />
            {items.length > 1 && (
              <Badge
                color="#8dc63f"
                text={`${items.length} PDFs attached`}
              />
            )}
          </div>

          {tests.length > 0 && (
            <ul className="space-y-0.5 mb-3">
              {tests.map((t, i) => (
                <li key={i} className="text-sm" style={{ color: "#ffffff" }}>
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
          )}

          {/* One row per attached PDF — keeps each individually viewable
              and runnable through AI interpretation. */}
          <ul className="space-y-1.5 mb-2">
            {items.map((r) => {
              const rowIsNew = !r.viewed_at;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 border"
                  style={{
                    backgroundColor: "#0f2614",
                    borderColor: rowIsNew ? "#c4973a" : "#2d6b35",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs break-words"
                      style={{
                        color: "#e8d5a3",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {r.file_name}
                    </p>
                    <p className="text-[11px]" style={{ color: "#6ab04c" }}>
                      Uploaded {formatDate(r.uploaded_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ViewResultButton
                      resultId={r.id}
                      storagePath={r.storage_path}
                      isNew={rowIsNew}
                    />
                    <AiInterpretationButton resultId={r.id} />
                  </div>
                </li>
              );
            })}
          </ul>

          {newestUploadedAt && (
            <p className="text-xs" style={{ color: "#6ab04c" }}>
              Most recent upload {formatDate(newestUploadedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Manual admin upload or patient self-upload ────────────────────────

function UploadedResultCard({ result }: { result: ResultRow }) {
  const isPatientUpload = classifyResultRow(result) === "patient";
  const docTypeLabel = result.document_type
    ? DOC_TYPE_LABEL[result.document_type] ?? "Document"
    : null;
  // Prefer the date the document was actually issued. Fall back to the
  // upload date when the admin didn't provide one (and for old rows).
  const displayDate = result.document_date ?? result.uploaded_at;
  const isFallbackDate = !result.document_date;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="px-5 sm:px-6 py-4 flex items-start gap-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
          style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
        >
          <FileText className="w-5 h-5" style={{ color: "#8dc63f" }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {isPatientUpload ? (
              <Badge
                color="#6ab04c"
                icon={<User className="w-3 h-3" />}
                text="Uploaded by you"
              />
            ) : (
              <Badge
                color="#c4973a"
                icon={<UserCheck className="w-3 h-3" />}
                text="Added by AvoVita"
              />
            )}
            {docTypeLabel && (
              <Badge color="#8dc63f" text={docTypeLabel} />
            )}
            {result.result_status === "partial" && (
              <Badge
                color="#c4973a"
                icon={<Clock className="w-3 h-3" />}
                text="Partial — more may follow"
              />
            )}
          </div>

          <p
            className="text-sm break-words"
            style={{ color: "#ffffff", overflowWrap: "anywhere" }}
          >
            {result.file_name}
          </p>

          {result.description && (
            <p
              className="text-xs mt-1 italic"
              style={{ color: "#e8d5a3" }}
            >
              {result.description}
            </p>
          )}

          <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
            {formatDate(displayDate)}
            {isFallbackDate && " (uploaded)"}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <ViewResultButton
              resultId={result.id}
              storagePath={result.storage_path}
              isNew={false}
            />
            {isPatientUpload && <DeleteMyRecordButton resultId={result.id} />}
          </div>
          <AiInterpretationButton resultId={result.id} />
        </div>
      </div>
    </div>
  );
}

// ─── Small reusable badge ──────────────────────────────────────────────

function Badge({
  color,
  icon,
  text,
}: {
  color: string;
  icon?: React.ReactNode;
  text: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full border"
      style={{
        backgroundColor: `${color}1f`,
        color,
        borderColor: color,
      }}
    >
      {icon}
      {text}
    </span>
  );
}
