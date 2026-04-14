"use client";

import Link from "next/link";
import { Leaf } from "lucide-react";
import { useOrg } from "./OrgContext";

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
  const baseStyle = transparent
    ? { backgroundColor: "transparent" }
    : { backgroundColor: "#0f2614", borderColor: "#1a3d22" };

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
        {rightSlot}
      </div>
    </header>
  );
}

function DefaultBrandMark() {
  return (
    <>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <Leaf className="w-5 h-5" style={{ color: "#8dc63f" }} />
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
            color: "#e8d5a3",
            letterSpacing: "0.05em",
          }}
        >
          Powered by{" "}
          <span style={{ color: "#c4973a", fontWeight: 600 }}>
            AvoVita Wellness
          </span>
        </p>
      </div>
    </div>
  );
}
