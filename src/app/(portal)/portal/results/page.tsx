import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";
import { ViewResultButton } from "@/components/ViewResultButton";
import type { PatientProfile } from "@/types/database";

type ResultRow = {
  id: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string;
  viewed_at: string | null;
  notified_at: string | null;
  profile_id: string;
  order_line: {
    id: string;
    test: { name: string; lab: { name: string } } | null;
  } | null;
};

export default async function ResultsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profilesRaw } = await supabase
    .from("patient_profiles")
    .select("id, first_name, last_name, is_primary")
    .eq("account_id", user.id)
    .order("is_primary", { ascending: false });
  const profiles = (profilesRaw ?? []) as Array<
    Pick<PatientProfile, "id" | "first_name" | "last_name" | "is_primary">
  >;

  const profileIds = profiles.map((p) => p.id);

  const { data: resultsRaw } = await supabase
    .from("results")
    .select(`
      id, storage_path, file_name, uploaded_at, viewed_at, notified_at,
      profile_id,
      order_line:order_lines(
        id, unit_price_cad,
        test:tests(name, turnaround_display, lab:labs(name))
      )
    `)
    .in("profile_id", profileIds)
    .order("uploaded_at", { ascending: false });
  // Filter out sentinel "direct delivery" rows — those are admin-only
  // acknowledgements for labs that send results straight to the care provider.
  // Sentinels are tagged with storage_path starting `__`.
  const results = ((resultsRaw ?? []) as unknown as ResultRow[]).filter(
    (r) => !r.storage_path.startsWith("__")
  );

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const resultsByProfile = new Map<string, ResultRow[]>();
  for (const result of results) {
    const existing = resultsByProfile.get(result.profile_id) ?? [];
    existing.push(result);
    resultsByProfile.set(result.profile_id, existing);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
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
          Your lab results are delivered securely here. PDFs are generated fresh each time.
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
            Results will appear here once your lab has processed your specimen.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(resultsByProfile.entries()).map(([profileId, profileResults]) => {
            const profile = profileMap.get(profileId);
            if (!profile) return null;

            return (
              <div
                key={profileId}
                className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
              >
                <div
                  className="px-6 py-4 border-b flex items-center gap-2"
                  style={{ borderColor: "#2d6b35" }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                  >
                    {profile.first_name[0]}
                    {profile.last_name[0]}
                  </div>
                  <h2
                    className="font-heading font-semibold"
                    style={{
                      color: "#ffffff",
                      fontFamily: '"Cormorant Garamond", Georgia, serif',
                    }}
                  >
                    {profile.first_name} {profile.last_name}
                  </h2>
                  {profile.is_primary && (
                    <span className="text-xs" style={{ color: "#6ab04c" }}>
                      (Primary)
                    </span>
                  )}
                </div>

                <div>
                  {profileResults.map((result, idx) => {
                    const testName = result.order_line?.test?.name ?? "Unknown Test";
                    const labName = result.order_line?.test?.lab?.name ?? "";
                    const isNew = !result.viewed_at;

                    return (
                      <div
                        key={result.id}
                        className="px-6 py-4 flex items-center gap-4"
                        style={{
                          borderTop: idx > 0 ? "1px solid #1a3d22" : "none",
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
                          style={{
                            backgroundColor: "#0f2614",
                            borderColor: isNew ? "#c4973a" : "#2d6b35",
                          }}
                        >
                          <FileText
                            className="w-5 h-5"
                            style={{ color: isNew ? "#c4973a" : "#6ab04c" }}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className="text-sm font-medium truncate"
                              style={{ color: "#ffffff" }}
                            >
                              {testName}
                            </p>
                            {isNew && (
                              <span
                                className="text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0 border"
                                style={{
                                  backgroundColor: "rgba(196, 151, 58, 0.125)",
                                  color: "#c4973a",
                                  borderColor: "#c4973a",
                                }}
                              >
                                New
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                            {labName && <span>{labName} · </span>}
                            Uploaded {formatDate(result.uploaded_at)}
                          </p>
                        </div>

                        <ViewResultButton
                          resultId={result.id}
                          storagePath={result.storage_path}
                          isNew={isNew}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
