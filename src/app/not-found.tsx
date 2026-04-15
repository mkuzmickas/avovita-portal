"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Leaf } from "lucide-react";

/**
 * App Router `not-found.tsx` is the only safe "catch-all" — Next.js
 * renders it only for routes that didn't match any page. A wildcard
 * `/:path*` redirect in next.config would match legitimate routes
 * too and break the whole site, so we redirect from this component
 * instead.
 */
export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace("/"), 1500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-md text-center">
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

        <p className="text-sm mb-2" style={{ color: "#e8d5a3" }}>
          Redirecting you home…
        </p>
        <Link
          href="/"
          className="text-sm underline"
          style={{ color: "#c4973a" }}
        >
          Go now
        </Link>
      </div>
    </div>
  );
}
