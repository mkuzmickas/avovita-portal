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
export function OrgLanding() {
  const org = useOrg();
  const accent = org?.primary_color ?? "#2d6b35";

  return (
    <div style={{ backgroundColor: "#0a1a0d" }}>
      <OrgAwareHeader transparent />

      {/* Hero */}
      <section
        className="relative flex items-center justify-center px-4 sm:px-6 pt-40 pb-16 md:pt-48 md:pb-20"
        style={{ backgroundColor: "#0a1a0d" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, #0f2614 0%, #0a1a0d 70%)",
          }}
        />

        <div className="relative max-w-4xl mx-auto text-center">
          <p
            className="font-semibold uppercase tracking-wider mb-3"
            style={{
              color: "#c4973a",
              fontSize: "11px",
              letterSpacing: "0.18em",
            }}
          >
            A trusted partnership
          </p>
          <h1
            className="font-heading text-4xl sm:text-5xl md:text-7xl font-semibold mb-6 leading-[1.05] tracking-tight"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Welcome,{" "}
            <span style={{ color: accent }}>{org?.name ?? "client"}</span>
          </h1>
          <p
            className="text-base sm:text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
            style={{ color: "#e8d5a3" }}
          >
            Browse our full catalogue of private lab tests or speak with our
            AI test advisor — all delivered to your door by AvoVita Wellness
            in Calgary.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
            <Link
              href={org ? `/org/${org.slug}/tests` : "/tests"}
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-semibold rounded-xl transition-colors w-full sm:w-auto"
              style={{
                backgroundColor: "#c4973a",
                color: "#0a1a0d",
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
                borderColor: accent,
                color: "#ffffff",
              }}
            >
              <Sparkles className="w-5 h-5" style={{ color: accent }} />
              AI Test Advisor
            </Link>
          </div>
        </div>
      </section>

      {/* Reassurance band */}
      <section
        className="px-4 sm:px-6 py-12"
        style={{ backgroundColor: "#0f2614" }}
      >
        <div className="max-w-3xl mx-auto text-center">
          <p
            className="text-sm uppercase tracking-wider font-semibold mb-2"
            style={{ color: accent, letterSpacing: "0.18em" }}
          >
            Powered by AvoVita Wellness
          </p>
          <h2
            className="font-heading text-2xl sm:text-3xl font-semibold mb-3"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Private, professional lab testing — at your home
          </h2>
          <p className="text-sm" style={{ color: "#e8d5a3" }}>
            FloLabs phlebotomists collect at your address, samples ship to
            world-class labs, and results land securely in your private portal.
            Protected under Alberta PIPA.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-4 sm:px-6 py-8 text-center text-xs border-t"
        style={{
          backgroundColor: "#0a1a0d",
          borderColor: "#1a3d22",
          color: "#6ab04c",
        }}
      >
        <p>
          © {new Date().getFullYear()} AvoVita Wellness · Calgary, AB
        </p>
        <p className="mt-2">
          Partnered with{" "}
          <span style={{ color: "#e8d5a3", fontWeight: 600 }}>
            {org?.name}
          </span>
        </p>
      </footer>
    </div>
  );
}
