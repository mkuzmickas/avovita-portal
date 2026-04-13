"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  Users,
  Upload,
  FlaskConical,
  LogOut,
  ArrowLeft,
  Leaf,
  Calendar,
  TrendingUp,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AdminSidebarProps {
  email: string;
  pendingResultsCount: number;
}

interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  key: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/admin/orders", label: "Orders", icon: Package, key: "orders" },
  { href: "/admin/manifests", label: "Manifests", icon: Calendar, key: "manifests" },
  { href: "/admin/quotes", label: "Quotes", icon: FileText, key: "quotes" },
  { href: "/admin/financials", label: "Financials", icon: TrendingUp, key: "financials" },
  { href: "/admin/patients", label: "Patients", icon: Users, key: "patients" },
  { href: "/admin/results", label: "Upload Results", icon: Upload, key: "results" },
  { href: "/admin/tests", label: "Tests", icon: FlaskConical, key: "tests" },
];

export function AdminSidebar({ email, pendingResultsCount }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      className="w-64 shrink-0 flex flex-col min-h-screen sticky top-0 border-r"
      style={{ backgroundColor: "#0f2614", borderColor: "#1a3d22" }}
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b" style={{ borderColor: "#1a3d22" }}>
        <Link href="/admin" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center border"
            style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
          >
            <Leaf className="w-4 h-4" style={{ color: "#c4973a" }} />
          </div>
          <div>
            <p
              className="font-heading font-semibold leading-tight"
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
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_LINKS.map(({ href, label, icon: Icon, key }) => {
          const active =
            href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(href);
          const showPendingBadge = key === "results" && pendingResultsCount > 0;

          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm font-medium transition-colors"
              style={
                active
                  ? {
                      color: "#c4973a",
                      backgroundColor: "#1f4a28",
                      borderLeft: "3px solid #c4973a",
                      paddingLeft: "calc(0.75rem - 3px)",
                    }
                  : {
                      color: "#e8d5a3",
                      backgroundColor: "transparent",
                      borderLeft: "3px solid transparent",
                      paddingLeft: "calc(0.75rem - 3px)",
                    }
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {showPendingBadge && (
                <span
                  className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold shrink-0"
                  style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                  title={`${pendingResultsCount} pending`}
                >
                  {pendingResultsCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Separator */}
        <div
          className="my-4 mx-3 h-px"
          style={{ backgroundColor: "#1a3d22" }}
        />

        <Link
          href="/portal"
          className="flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm font-medium transition-colors"
          style={{
            color: "#e8d5a3",
            borderLeft: "3px solid transparent",
            paddingLeft: "calc(0.75rem - 3px)",
          }}
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Back to Portal
        </Link>
      </nav>

      {/* Admin email + logout */}
      <div
        className="px-3 py-4 border-t space-y-1"
        style={{ borderColor: "#1a3d22" }}
      >
        <p className="px-3 text-xs truncate" style={{ color: "#6ab04c" }}>
          {email}
        </p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left transition-colors"
          style={{ color: "#e8d5a3" }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
