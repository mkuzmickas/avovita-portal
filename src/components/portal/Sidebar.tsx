"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Users,
  Settings,
  LogOut,
  Leaf,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface PortalSidebarProps {
  /** Displayed at the top of the sidebar. Pass primary profile first name when available. */
  displayName: string;
  /** Raw account email shown under the display name. */
  email: string;
  /** When > 0, shows a gold dot next to "My Results". */
  unviewedResultsCount: number;
}

const NAV_LINKS = [
  { href: "/portal", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/portal/orders", label: "My Orders", icon: ClipboardList, key: "orders" },
  { href: "/portal/results", label: "My Results", icon: FileText, key: "results" },
  { href: "/portal/profiles", label: "My Profiles", icon: Users, key: "profiles" },
  { href: "/portal/settings", label: "Settings", icon: Settings, key: "settings" },
];

export function PortalSidebar({
  displayName,
  email,
  unviewedResultsCount,
}: PortalSidebarProps) {
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
      className="w-64 shrink-0 flex-col min-h-screen sticky top-0 border-r hidden md:flex"
      style={{ backgroundColor: "#0f2614", borderColor: "#1a3d22" }}
    >
      {/* Logo + user */}
      <div
        className="px-6 py-5 border-b"
        style={{ borderColor: "#1a3d22" }}
      >
        <Link href="/portal" className="flex items-center gap-2.5 mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center border"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <Leaf className="w-4 h-4" style={{ color: "#8dc63f" }} />
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
            <p className="text-xs" style={{ color: "#6ab04c" }}>
              Patient Portal
            </p>
          </div>
        </Link>

        <div className="mt-2">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: "#ffffff" }}
          >
            {displayName}
          </p>
          {email && email !== displayName && (
            <p
              className="text-xs truncate mt-0.5"
              style={{ color: "#6ab04c" }}
            >
              {email}
            </p>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_LINKS.map(({ href, label, icon: Icon, key }) => {
          const active =
            href === "/portal"
              ? pathname === "/portal"
              : pathname.startsWith(href);
          const showDot = key === "results" && unviewedResultsCount > 0;

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
              {showDot && (
                <span
                  className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold shrink-0"
                  style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                  aria-label={`${unviewedResultsCount} unviewed results`}
                >
                  {unviewedResultsCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div
        className="px-3 py-4 border-t"
        style={{ borderColor: "#1a3d22" }}
      >
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
