import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Leaf, LayoutDashboard, Package, Upload, LogOut } from "lucide-react";
import type { Account } from "@/types/database";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("email, role")
    .eq("id", user.id)
    .single() as { data: Pick<Account, "email" | "role"> | null; error: unknown };

  if (!account || account.role !== "admin") redirect("/portal");

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <aside
        className="w-64 shrink-0 flex flex-col min-h-screen sticky top-0 border-r"
        style={{ backgroundColor: "#0f2614", borderColor: "#1a3d22" }}
      >
        <div
          className="px-6 py-5 border-b"
          style={{ borderColor: "#1a3d22" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
            >
              <Leaf className="w-4 h-4" style={{ color: "#c4973a" }} />
            </div>
            <div>
              <p
                className="font-heading font-semibold"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                AvoVita
              </p>
              <p className="text-xs" style={{ color: "#c4973a" }}>
                Admin
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {[
            { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
            { href: "/admin/results", label: "Upload Results", icon: Upload },
            { href: "/admin/orders", label: "Orders", icon: Package },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm font-medium transition-colors"
              style={{
                color: "#e8d5a3",
                borderLeft: "3px solid transparent",
                paddingLeft: "calc(0.75rem - 3px)",
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div
          className="px-3 py-4 border-t space-y-1"
          style={{ borderColor: "#1a3d22" }}
        >
          <p
            className="px-3 text-xs truncate"
            style={{ color: "#6ab04c" }}
          >
            {account?.email}
          </p>
          <Link
            href="/portal"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ color: "#e8d5a3" }}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Back to Portal
          </Link>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
