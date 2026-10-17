"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf } from "lucide-react";
import { useOrg } from "./OrgContext";
import { AccountIndicator } from "@/components/auth/AccountIndicator";

/**
 * Top header used by the homepage and the catalogue page. When an
 * OrgProvider is in scope it swaps to the partner's logo + a
 * "Powered by AvoVita Wellness" lockup. Outside an org route it
 * renders the standard AvoVita brand bar.
 */
export function OrgAwareHeader({
  rightSlot,
  transparent = false,
  homeHref,
}: {
  rightSlot?: React.ReactNode;
  /** Use the absolutely-positioned transparent variant (homepage hero overlay). */
  transparent?: boolean;
  /** Where the brand-mark links to. Defaults to the org root or "/". */
  homeHref?: string;
}) {
  const org = useOrg();
  const href = homeHref ?? (org ? `/org/${org.slug}` : "/");

  const baseClass = transparent
    ? "absolute top-0 left-0 right-0 z-20"
    : "border-b";
  // Nav bar stays dark forest under the new ivory palette — per the
  // Oct 2026 "lighter premium healthcare" direction the header /
  // footer bands remain forest (#092819) while the main page bg
  // becomes ivory. Pinning the hex here before the global sweep so
  // the find-replace doesn't drag it into white.
  const baseStyle = transparent
    ? { backgroundColor: "transparent" }
    : { backgroundColor: "#092819", borderColor: "#092819" };

  return (
    <header className={baseClass} style={baseStyle}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3">
        <Link href={href} className="flex items-center gap-2.5 min-w-0">
          {org ? (
            <OrgBrandMark org={org} />
          ) : (
            <DefaultBrandMark />
          )}
        </Link>
        {/* Public site nav — only on AvoVita-direct pages (not org routes) */}
        {!org && !transparent && <PublicNav />}

        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {rightSlot}
          <AccountIndicator />
        </div>
      </div>
    </header>
  );
}

function DefaultBrandMark() {
  return (
    <>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0"
        style={{ backgroundColor: "#154d31", borderColor: "#154d31" }}
      >
        <Leaf className="w-5 h-5" style={{ color: "#88d45d" }} />
      </div>
      <span
        className="font-heading text-xl font-semibold truncate"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        AvoVita Wellness
      </span>
    </>
  );
}

// Supplements + Resources removed from the public nav Oct 2026 (Mike):
// the catalog is lab tests only, supplements still work in the
// invoicing module (admin-added line items on client invoices) but
// are no longer part of the user-driven checkout experience.
const NAV_ITEMS = [
  { href: "/tests", label: "Lab Tests" },
];

function PublicNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden sm:flex items-center gap-1">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              // Dark nav bar bg → white text with gold active state.
              color: isActive ? "#C6A04B" : "#F7F6F0",
              backgroundColor: isActive ? "rgba(198,160,75,0.12)" : "transparent",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function OrgBrandMark({
  org,
}: {
  org: { name: string; logo_url: string | null; primary_color: string };
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {org.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={org.logo_url}
          alt={`${org.name} logo`}
          className="h-9 sm:h-10 w-auto rounded shrink-0"
          style={{ maxWidth: "180px", objectFit: "contain" }}
        />
      ) : (
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center border shrink-0"
          style={{
            backgroundColor: org.primary_color,
            borderColor: org.primary_color,
            color: "#ffffff",
            fontWeight: 700,
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontSize: "13px",
          }}
        >
          {org.name
            .split(/\s+/)
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p
          className="font-heading text-base sm:text-lg font-semibold leading-tight truncate"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          {org.name}
        </p>
        <p
          className="text-[10px] sm:text-xs"
          style={{
            color: "#154D31",
            letterSpacing: "0.05em",
          }}
        >
          Powered by{" "}
          <span style={{ color: "#C6A04B", fontWeight: 600 }}>
            AvoVita Wellness
          </span>
        </p>
      </div>
    </div>
  );
}
