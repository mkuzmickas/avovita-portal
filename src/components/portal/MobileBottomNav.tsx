"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Users,
  Settings,
} from "lucide-react";

const TABS = [
  { href: "/portal", label: "Home", icon: LayoutDashboard },
  { href: "/portal/orders", label: "Orders", icon: ClipboardList },
  { href: "/portal/results", label: "Results", icon: FileText, key: "results" },
  { href: "/portal/profiles", label: "Profiles", icon: Users },
  { href: "/portal/settings", label: "Settings", icon: Settings },
];

export interface MobileBottomNavProps {
  unviewedResultsCount: number;
}

/**
 * Bottom tab bar shown below md breakpoint. Mirrors the desktop sidebar
 * navigation. Includes the same gold-dot unviewed-results indicator.
 */
export function MobileBottomNav({
  unviewedResultsCount,
}: MobileBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t"
      style={{
        backgroundColor: "#0f2614",
        borderColor: "#1a3d22",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Portal navigation"
    >
      {TABS.map(({ href, label, icon: Icon, key }) => {
        const active =
          href === "/portal"
            ? pathname === "/portal"
            : pathname.startsWith(href);
        const showDot = key === "results" && unviewedResultsCount > 0;

        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center py-2 relative"
            style={{
              color: active ? "#c4973a" : "#6ab04c",
              borderTop: active
                ? "2px solid #c4973a"
                : "2px solid transparent",
            }}
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-medium">{label}</span>
            {showDot && (
              <span
                className="absolute top-1.5 right-[calc(50%-18px)] w-2 h-2 rounded-full"
                style={{ backgroundColor: "#c4973a" }}
                aria-label={`${unviewedResultsCount} unviewed results`}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
