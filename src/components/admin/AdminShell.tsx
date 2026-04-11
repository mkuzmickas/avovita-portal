"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, Leaf } from "lucide-react";
import Link from "next/link";
import { AdminSidebar } from "./AdminSidebar";

interface AdminShellProps {
  email: string;
  pendingResultsCount: number;
  children: React.ReactNode;
}

/**
 * Responsive wrapper around the AdminSidebar:
 *   - desktop (md+): sticky left sidebar (always visible)
 *   - mobile: hamburger button in a top bar, sidebar slides in as a drawer
 *
 * The drawer auto-closes on route change.
 */
export function AdminShell({
  email,
  pendingResultsCount,
  children,
}: AdminShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0a1a0d" }}>
      {/* Desktop sidebar (hidden < md) */}
      <div className="hidden md:flex">
        <AdminSidebar
          email={email}
          pendingResultsCount={pendingResultsCount}
        />
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            className="md:hidden fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
            onClick={() => setOpen(false)}
          />
          <div className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-64">
            <AdminSidebar
              email={email}
              pendingResultsCount={pendingResultsCount}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-lg"
              style={{ color: "#e8d5a3" }}
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </>
      )}

      {/* Main content column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header
          className="md:hidden sticky top-0 z-30 border-b px-4 py-3 flex items-center justify-between"
          style={{
            backgroundColor: "#0f2614",
            borderColor: "#1a3d22",
          }}
        >
          <Link href="/admin" className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center border"
              style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
            >
              <Leaf className="w-3.5 h-3.5" style={{ color: "#c4973a" }} />
            </div>
            <span
              className="font-heading text-base font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              AvoVita Admin
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="p-2 rounded-lg border relative"
            style={{
              color: "#e8d5a3",
              borderColor: "#2d6b35",
              backgroundColor: "#1a3d22",
            }}
          >
            <Menu className="w-5 h-5" />
            {pendingResultsCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
              >
                {pendingResultsCount}
              </span>
            )}
          </button>
        </header>

        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
