import Link from "next/link";
import { Leaf, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center border"
            style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
          >
            <Leaf className="w-5 h-5" style={{ color: "#8dc63f" }} />
          </div>
          <span
            className="font-heading text-2xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            AvoVita Wellness
          </span>
        </div>

        <p
          className="text-8xl font-heading font-semibold mb-2"
          style={{
            color: "#c4973a",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          404
        </p>
        <h1
          className="font-heading text-3xl sm:text-4xl font-semibold mb-3"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Page not found
        </h1>
        <p
          className="text-sm sm:text-base mb-8 max-w-sm mx-auto leading-relaxed"
          style={{ color: "#e8d5a3" }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has moved.
          Let&apos;s get you back on track.
        </p>

        <Link href="/" className="mf-btn-primary px-6 py-3 inline-flex">
          Back to home
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
