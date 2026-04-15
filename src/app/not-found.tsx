"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Unmatched-route handler. App Router renders this only when no page
 * matches, so we can safely redirect straight to the homepage.
 */
export default function NotFound() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#0a1a0d" }}
      aria-hidden
    />
  );
}
