import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PendingBatchImporter } from "@/components/admin/PendingBatchImporter";

export const dynamic = "force-dynamic";

export default async function MayoPendingBatchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?returnUrl=/admin/mayo/pending-batch");
  const { data: caller } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((caller as { role?: string } | null)?.role !== "admin") {
    redirect("/portal");
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>Mayo Pending Batch</span> Import
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "#e8d5a3" }}>
          Drop the CSV exported from MayoLINK&apos;s{" "}
          <strong>Download list</strong> button on the Pending Batch view.
          The system matches each row to a portal order and lets you stamp
          Mayo&apos;s identifiers onto matched orders. Re-importing the
          same CSV is safe — rows already stamped show as such and skip
          the audit log.
        </p>
      </div>

      <PendingBatchImporter />
    </div>
  );
}
