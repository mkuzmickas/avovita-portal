"use client";

import Link from "next/link";
import { ArrowRight, FlaskConical, Sparkles } from "lucide-react";
import { OrgAwareHeader } from "./OrgAwareHeader";
import { useOrg } from "./OrgContext";

/**
 * Org-branded landing page rendered at /org/[slug]. Mirrors the
 * structure of the public homepage (hero + dual CTAs + reassurance
 * footer) but pulls colours and copy from the org via OrgContext.
 */
// Palette rules for org landing on Midnight Forest:
//   - Large text + headings → AvoVita gold (#C6A04B). Org primary_color
//     is often a deep brand colour (navy, maroon) that washes out on
//     #F7F6F0, so we don't use it for type.
//   - Section labels → AvoVita light green (#88D45D) for consistency.
//   - Org primary_color is reserved for small badges/avatars only
//     (handled inside OrgAwareHeader).
const HEADING_GOLD = "#C6A04B";
const LABEL_GREEN = "#88D45D";

export function OrgLanding() {
  const org = useOrg();

  return (
    <div style={{ backgroundColor: "#FFFFFF" }}>
      <OrgAwareHeader transparent />

      {/* Hero */}
      <section
        className="relative flex items-center justify-center px-4 sm:px-6 pt-40 pb-16 md:pt-48 md:pb-20"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, #F7F6F0 0%, #F7F6F0 70%)",
          }}
        />

        <div className="relative max-w-4xl mx-auto text-center">
          <p
            className="font-semibold uppercase tracking-wider mb-3"
            style={{
              color: LABEL_GREEN,
              fontSize: "11px",
              letterSpacing: "0.18em",
            }}
          >
            A trusted partnership
          </p>
          <h1
            className="font-heading text-4xl sm:text-5xl md:text-7xl font-semibold mb-6 leading-[1.05] tracking-tight"
            style={{
              color: "#092819",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Welcome,{" "}
            <span style={{ color: HEADING_GOLD }}>{org?.name ?? "client"}</span>
          </h1>
          <p
            className="text-base sm:text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
            style={{ color: "#154D31" }}
          >
            Browse our full catalogue of private lab tests or speak with our
            AI test advisor — all delivered to your door by AvoVita
            in Calgary.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
            <Link
              href={org ? `/org/${org.slug}/tests` : "/tests"}
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-semibold rounded-xl transition-colors w-full sm:w-auto"
              style={{
                backgroundColor: "#C6A04B",
                color: "#ffffff",
              }}
            >
              <FlaskConical className="w-5 h-5" />
              Browse Our Tests
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href={org ? `/org/${org.slug}/tests` : "/tests"}
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-semibold rounded-xl border transition-colors w-full sm:w-auto"
              style={{
                backgroundColor: "transparent",
                borderColor: HEADING_GOLD,
                color: "#092819",
              }}
            >
              <Sparkles className="w-5 h-5" style={{ color: HEADING_GOLD }} />
              AI Test Advisor
            </Link>
          </div>
        </div>
      </section>

      {/* Reassurance band */}
      <section
        className="px-4 sm:px-6 py-12"
        style={{ backgroundColor: "#F7F6F0" }}
      >
        <div className="max-w-3xl mx-auto text-center">
          <p
            className="text-sm uppercase tracking-wider font-semibold mb-2"
            style={{ color: LABEL_GREEN, letterSpacing: "0.18em" }}
          >
            Powered by AvoVita
          </p>
          <h2
            className="font-heading text-2xl sm:text-3xl font-semibold mb-3"
            style={{
              color: "#092819",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Private, professional lab testing — at your home
          </h2>
          <p className="text-sm" style={{ color: "#154D31" }}>
            Phlebotomists collect at your address, samples ship to
            world-class labs, and results land securely in your private portal.
            Protected under Alberta PIPA.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-4 sm:px-6 py-8 text-center text-xs border-t"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#FFFFFF",
          color: "#4a7a56",
        }}
      >
        <p>
          © {new Date().getFullYear()} AvoVita · Calgary, AB
        </p>
        <p className="mt-2">
          In collaboration with{" "}
          <span style={{ color: "#154D31", fontWeight: 600 }}>
            {org?.name}
          </span>
        </p>
      </footer>
    </div>
  );
}
