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

interface PortalSidebarProps {
  email: string;
}

const navLinks = [
  { href: "/portal", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/orders", label: "My Orders", icon: ClipboardList },
  { href: "/portal/results", label: "My Results", icon: FileText },
  { href: "/portal/profiles", label: "My Profiles", icon: Users },
  { href: "/portal/settings", label: "Settings", icon: Settings },
];

export function PortalSidebar({ email }: PortalSidebarProps) {
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
      <div
        className="px-6 py-5 border-b"
        style={{ borderColor: "#1a3d22" }}
      >
        <Link href="/portal" className="flex items-center gap-2.5 group">
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
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/portal"
              ? pathname === "/portal"
              : pathname.startsWith(href);
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
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User / Logout */}
      <div
        className="px-3 py-4 border-t space-y-1"
        style={{ borderColor: "#1a3d22" }}
      >
        <p
          className="px-3 text-xs truncate"
          style={{ color: "#6ab04c" }}
        >
          {email}
        </p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left"
          style={{ color: "#e8d5a3" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#1f4a28";
            e.currentTarget.style.color = "#e05252";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#e8d5a3";
          }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
