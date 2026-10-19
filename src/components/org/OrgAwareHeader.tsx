"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf, Check, MessageCircle } from "lucide-react";
import { useOrg } from "./OrgContext";
import { AccountIndicator } from "@/components/auth/AccountIndicator";

/**
 * Top header used by the homepage and the catalogue page. When an
 * OrgProvider is in scope it swaps to the partner's logo + a
 * "Powered by AvoVita" lockup. Outside an org route it
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

  const pathname = usePathname();
  const onCataloguePage =
    pathname === "/tests" ||
    pathname?.startsWith("/tests/") ||
    /^\/org\/[^/]+\/tests($|\/)/.test(pathname ?? "");

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
        {/* Center slot:
         *   - On /tests, the "Lab Tests" nav link is useless (user is
         *     already there), so swap it for a condensed trust strip
         *     answering the three objections that stop first-time
         *     private-lab visitors: do I need a referral, do I have
         *     to come in, where do results go. "For most tests" is
         *     the honest hedge — specialty cancer / genetics / FRAT
         *     still require a req, and we badge those per-test.
         *   - On other public pages, keep the Lab Tests link so
         *     visitors can get to the catalogue.
         */}
        {!org && !transparent &&
          (onCataloguePage ? <TrustStrip /> : <PublicNav />)}

        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <WhatsAppQuickConnect />
          {rightSlot}
          <AccountIndicator />
        </div>
      </div>
    </header>
  );
}

function DefaultBrandMark() {
  // Dark-forest nav bar → use the reversed wordmark PNG so the gold +
  // silver treatment reads properly against #14301A. 36px tall matches
  // the spec's header mark size.
  return (
    <img
      src="/logo-white.png?v=2"
      alt="AvoVita — Private Blood Testing"
      style={{ height: 36, width: "auto", display: "block" }}
    />
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

// Three trust facts replacing the Lab Tests nav link on the catalogue
// page. Hidden on mobile (nav is already tight with logo + account
// dropdown + WhatsApp button) — reasserts on sm+ breakpoints where
// there's room. "For most tests" is the deliberate hedge for FRAT,
// prenatal genetic screening, and specialty cancer markers that
// legitimately need a requisition — those are per-test badged in the
// catalogue table.
function TrustStrip() {
  const items = [
    "No referral for most tests",
    "Mobile collection",
    "Private results",
  ];
  return (
    <nav
      aria-label="What makes AvoVita different"
      className="hidden md:flex items-center gap-5"
    >
      {items.map((label) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
          style={{ color: "#F7F6F0" }}
        >
          <Check
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "#88D45D" }}
          />
          {label}
        </span>
      ))}
    </nav>
  );
}

// WhatsApp quick-connect — opens wa.me/<number> in a new tab with a
// prefilled message. Hidden when the env var is unset so unconfigured
// deploys don't show a dead button. Set NEXT_PUBLIC_SUPPORT_WHATSAPP
// to the full international-format number WITHOUT the +, e.g.
// "14035551234" for Canada +1 403 555 1234.
function WhatsAppQuickConnect() {
  const raw = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 10) return null;
  const prefill = encodeURIComponent("Hi AvoVita — I have a question.");
  const href = `https://wa.me/${digits}?text=${prefill}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Message us on WhatsApp"
      title="Message us on WhatsApp"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
      style={{
        backgroundColor: "rgba(136,212,93,0.15)",
        color: "#88D45D",
        border: "1px solid rgba(136,212,93,0.35)",
      }}
    >
      <MessageCircle className="w-4 h-4 shrink-0" />
      <span className="hidden sm:inline">Message</span>
    </a>
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
          <span style={{ color: "#8A5A17", fontWeight: 600 }}>
            AvoVita
          </span>
        </p>
      </div>
    </div>
  );
}
