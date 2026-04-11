import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortalSidebar } from "@/components/PortalSidebar";
import type { Account } from "@/types/database";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("email, role")
    .eq("id", user.id)
    .single() as { data: Pick<Account, "email" | "role"> | null; error: unknown };

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <PortalSidebar email={account?.email ?? user.email ?? ""} />
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
