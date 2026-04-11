"use client";

import { useEffect } from "react";
import { Leaf, RotateCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Surface to server logs for debugging
    console.error("[global-error]", error);
  }, [error]);

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

        <p
          className="text-8xl font-heading font-semibold mb-2"
          style={{
            color: "#c4973a",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          500
        </p>
        <h1
          className="font-heading text-3xl sm:text-4xl font-semibold mb-3"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Something went wrong
        </h1>
        <p
          className="text-sm sm:text-base mb-2 max-w-sm mx-auto leading-relaxed"
          style={{ color: "#e8d5a3" }}
        >
          We&apos;ve logged the issue and our team has been notified. Please
          try again, or contact{" "}
          <a
            href="mailto:hello@avovita.ca"
            className="underline"
            style={{ color: "#c4973a" }}
          >
            hello@avovita.ca
          </a>{" "}
          if the problem persists.
        </p>
        {error.digest && (
          <p className="text-xs mb-6" style={{ color: "#6ab04c" }}>
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mf-btn-primary px-6 py-3"
        >
          <RotateCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
