"use client";

import { useEffect, useState } from "react";
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
  Building2,
  BarChart3,
  Pill,
  BookOpen,
  Receipt,
  FileInput,
  Truck,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AdminSidebarProps {
  email: string;
  role: string;
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
  { href: "/admin/calendar", label: "Calendar", icon: Calendar, key: "calendar" },
  { href: "/admin/clinic", label: "Clinic Day", icon: Building2, key: "clinic" },
  { href: "/admin/bookings/queue", label: "Booking Queue", icon: FileInput, key: "bookings-queue" },
  { href: "/admin/orders", label: "Orders", icon: Package, key: "orders" },
  { href: "/admin/quotes", label: "Quotes", icon: FileText, key: "quotes" },
  { href: "/admin/financials", label: "Financials", icon: TrendingUp, key: "financials" },
  { href: "/admin/invoices", label: "Invoices", icon: Receipt, key: "invoices" },
  { href: "/admin/patients", label: "Clients", icon: Users, key: "patients" },
  { href: "/admin/results", label: "Upload Results", icon: Upload, key: "results" },
  { href: "/admin/mayo/invoices", label: "Mayo Invoices", icon: FileInput, key: "mayo-invoices" },
  { href: "/shipping", label: "Shipping", icon: Truck, key: "shipping" },
  { href: "/admin/tests", label: "Tests", icon: FlaskConical, key: "tests" },
  { href: "/admin/supplements", label: "Supplements", icon: Pill, key: "supplements" },
  { href: "/admin/resources", label: "Resources", icon: BookOpen, key: "resources" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, key: "analytics" },
];

const COLLAPSE_STORAGE_KEY = "avovita.admin.sidebarCollapsed";

export function AdminSidebar({ email, role, pendingResultsCount }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Collapsed state persists per-browser via localStorage so the choice
  // survives page navigation and reloads. SSR renders expanded; the
  // mount effect reads the stored value and flips if needed. The 1-tick
  // flash from expanded → collapsed is cheap compared to hydration
  // mismatches from reading storage on first render.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1") {
        setCollapsed(true);
      }
    } catch {
      /* private mode / blocked storage — leave expanded */
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // calendar_viewer sees only the Calendar link — scoped role for
  // FloLabs staff who need visibility into collection times but no
  // access to orders / patients / financials.
  const visibleLinks =
    role === "calendar_viewer"
      ? NAV_LINKS.filter((l) => l.key === "calendar")
      : NAV_LINKS;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const asideWidth = collapsed ? "w-16" : "w-64";

  return (
    <aside
      className={`${asideWidth} shrink-0 flex flex-col min-h-screen sticky top-0 border-r transition-[width] duration-200`}
      style={{ backgroundColor: "#0f2614", borderColor: "#1a3d22" }}
    >
      {/* Logo + collapse toggle */}
      <div
        className="px-3 py-5 border-b flex items-center gap-2"
        style={{ borderColor: "#1a3d22" }}
      >
        <Link
          href="/admin"
          className="flex items-center gap-2.5 group flex-1 min-w-0"
          title={collapsed ? "AvoVita Admin" : undefined}
        >
          {collapsed ? (
            // Collapsed rail — leaf icon stand-in; wordmark would be
            // unreadable at this scale.
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0"
              style={{ backgroundColor: "#1B4D2E", borderColor: "#E1A652" }}
            >
              <Leaf className="w-4 h-4" style={{ color: "#E1A652" }} />
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/logo-white.png?v=2"
                alt="AvoVita"
                style={{ height: 28, width: "auto", display: "block" }}
              />
              <span
                className="text-xs shrink-0"
                style={{
                  color: "#E1A652",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Admin
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{ color: "#c4973a", backgroundColor: "#1a3d22" }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="w-4 h-4" />
          ) : (
            <ChevronsLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleLinks.map(({ href, label, icon: Icon, key }) => {
          const active =
            href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(href);
          const showPendingBadge = key === "results" && pendingResultsCount > 0;

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-r-lg text-sm font-medium transition-colors relative`}
              style={
                active
                  ? {
                      color: "#c4973a",
                      backgroundColor: "#1f4a28",
                      borderLeft: "3px solid #c4973a",
                      paddingLeft: collapsed
                        ? "calc(0.75rem - 3px)"
                        : "calc(0.75rem - 3px)",
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
              {!collapsed && <span className="flex-1">{label}</span>}
              {showPendingBadge &&
                (collapsed ? (
                  <span
                    className="absolute top-1 right-1 w-2 h-2 rounded-full"
                    style={{ backgroundColor: "#c4973a" }}
                    title={`${pendingResultsCount} pending`}
                  />
                ) : (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold shrink-0"
                    style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                    title={`${pendingResultsCount} pending`}
                  >
                    {pendingResultsCount}
                  </span>
                ))}
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
          title={collapsed ? "Back to Portal" : undefined}
          className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-r-lg text-sm font-medium transition-colors`}
          style={{
            color: "#e8d5a3",
            borderLeft: "3px solid transparent",
            paddingLeft: "calc(0.75rem - 3px)",
          }}
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Back to Portal</span>}
        </Link>
      </nav>

      {/* Admin email + logout */}
      <div
        className="px-3 py-4 border-t space-y-1"
        style={{ borderColor: "#1a3d22" }}
      >
        {!collapsed && (
          <p className="px-3 text-xs truncate" style={{ color: "#6ab04c" }}>
            {email}
          </p>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? `Sign out — ${email}` : undefined}
          className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left transition-colors`}
          style={{ color: "#e8d5a3" }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
