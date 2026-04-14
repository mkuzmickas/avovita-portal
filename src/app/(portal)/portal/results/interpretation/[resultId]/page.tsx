import { notFound, redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { InterpretationClient } from "@/components/portal/InterpretationClient";

export const dynamic = "force-dynamic";

export default async function InterpretationPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  // Feature-gated: when flag is off, pretend the page doesn't exist so
  // there's no way for curious clients to discover the endpoint by URL.
  if (process.env.NEXT_PUBLIC_ENABLE_AI_INTERPRETATION !== "true") {
    notFound();
  }

  const { resultId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/login?returnUrl=${encodeURIComponent(
        `/portal/results/interpretation/${resultId}`
      )}`
    );
  }

  const service = createServiceRoleClient();
  const { data: resultRow } = await service
    .from("results")
    .select(
      "id, file_name, uploaded_at, profile:patient_profiles(account_id)"
    )
    .eq("id", resultId)
    .maybeSingle();
  type Row = {
    id: string;
    file_name: string;
    uploaded_at: string;
    profile:
      | { account_id: string }
      | { account_id: string }[]
      | null;
  };
  const row = resultRow as Row | null;
  if (!row) notFound();

  const profileAccountId = Array.isArray(row.profile)
    ? row.profile[0]?.account_id
    : row.profile?.account_id;
  if (profileAccountId !== user.id) notFound();

  return (
    <InterpretationClient
      resultId={row.id}
      fileName={row.file_name}
      uploadedAt={row.uploaded_at}
    />
  );
}
