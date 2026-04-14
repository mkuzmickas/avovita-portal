import Link from "next/link";
import { Leaf, FlaskConical, Shield, Clock, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div style={{ backgroundColor: "#0a1a0d", color: "#e8d5a3" }}>
      {/* ─── Navbar ─────────────────────────────────────────────────────── */}
      <header
        className="absolute top-0 left-0 right-0 z-20"
        style={{ backgroundColor: "transparent" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center border"
              style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
            >
              <Leaf className="w-5 h-5" style={{ color: "#8dc63f" }} />
            </div>
            <span
              className="font-heading text-xl font-semibold"
              style={{ color: "#ffffff", fontFamily: '"Cormorant Garamond", Georgia, serif' }}
            >
              AvoVita Wellness
            </span>
          </Link>

          {/* Understated Existing Client Login — only login entry on homepage */}
          <Link
            href="/login"
            className="text-sm font-medium px-4 py-2 rounded-lg border transition-colors"
            style={{
              color: "#e8d5a3",
              borderColor: "#2d6b35",
              backgroundColor: "transparent",
            }}
            onMouseEnter={undefined}
          >
            Existing Client Login
          </Link>
        </div>
      </header>

      {/* ─── Hero (full viewport) ───────────────────────────────────────── */}
      <section
        className="relative flex items-center justify-center px-4 sm:px-6 pt-40 pb-4 md:pt-48 md:pb-6"
        style={{ backgroundColor: "#0a1a0d" }}
      >
        {/* Soft radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, #0f2614 0%, #0a1a0d 70%)",
          }}
        />

        <div className="relative max-w-4xl mx-auto text-center">
          <h1
            className="font-heading text-5xl md:text-7xl font-semibold mb-8 leading-[1.05] tracking-tight"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Private Lab Testing,
            <br />
            <span style={{ color: "#c4973a" }}>Delivered</span> to Your Door
          </h1>

          <p
            className="text-lg md:text-xl mb-12 max-w-2xl mx-auto leading-relaxed"
            style={{ color: "#e8d5a3" }}
          >
            Skip the clinic. A FloLabs phlebotomist visits your home in Calgary,
            we ship your specimen to world-class labs, and deliver your results securely online.
          </p>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
            <Link
              href="/tests"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-semibold rounded-xl transition-colors w-full sm:w-auto"
              style={{
                backgroundColor: "#c4973a",
                color: "#0a1a0d",
              }}
            >
              First Visit? Browse Tests
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-semibold rounded-xl border transition-colors w-full sm:w-auto"
              style={{
                backgroundColor: "transparent",
                borderColor: "#c4973a",
                color: "#c4973a",
              }}
            >
              Existing Client? Sign In
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── How It Works ───────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 pt-12 pb-24" style={{ backgroundColor: "#0a1a0d" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="font-heading text-4xl md:text-5xl font-semibold mb-4"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              How It Works
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: "#e8d5a3" }}>
              A seamless experience from order to results — designed for discretion and convenience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: FlaskConical,
                title: "Order Online",
                description:
                  "Browse our catalogue of private lab tests. Add tests to your cart and check out securely.",
              },
              {
                icon: Clock,
                title: "In-Home Collection",
                description:
                  "A FloLabs phlebotomist visits your home at a time that suits you. No clinic waiting rooms.",
              },
              {
                icon: Shield,
                title: "Secure Results",
                description:
                  "Results delivered to your private patient portal. Protected under Alberta PIPA.",
              },
            ].map(({ icon: Icon, title, description }, idx) => (
              <div
                key={title}
                className="p-8 rounded-2xl border text-center transition-colors"
                style={{
                  backgroundColor: "#1a3d22",
                  borderColor: "#2d6b35",
                }}
              >
                <p
                  className="mb-3 font-semibold uppercase"
                  style={{
                    color: "#c4973a",
                    fontSize: "11px",
                    letterSpacing: "0.15em",
                  }}
                >
                  Step {idx + 1}
                </p>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 border"
                  style={{
                    backgroundColor: "#0f2614",
                    borderColor: "#2d6b35",
                  }}
                >
                  <Icon className="w-7 h-7" style={{ color: "#8dc63f" }} />
                </div>
                <h3
                  className="font-heading text-2xl font-semibold mb-3"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  {title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#e8d5a3" }}>
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA band ──────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 py-20" style={{ backgroundColor: "#0f2614" }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="font-heading text-3xl md:text-4xl font-semibold mb-4"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Ready to take control of <span style={{ color: "#c4973a" }}>your health?</span>
          </h2>
          <p className="mb-8 text-base" style={{ color: "#e8d5a3" }}>
            Private, convenient, and PIPA-compliant lab testing in Calgary.
          </p>
          <Link
            href="/tests"
            className="inline-flex items-center gap-2 px-8 py-3.5 font-semibold rounded-xl transition-colors"
            style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
          >
            View All Tests
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer
        className="px-4 sm:px-6 py-10 text-center text-xs border-t"
        style={{
          backgroundColor: "#0a1a0d",
          borderColor: "#1a3d22",
          color: "#6ab04c",
        }}
      >
        <p>© {new Date().getFullYear()} AvoVita Wellness · Calgary, AB</p>
        <p className="mt-2">
          All health information protected under Alberta PIPA.{" "}
          <Link
            href="/login"
            className="underline"
            style={{ color: "#e8d5a3" }}
          >
            Existing Client Login
          </Link>
        </p>
      </footer>
    </div>
  );
}
