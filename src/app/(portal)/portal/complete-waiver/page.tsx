"use client";

import { useRouter } from "next/navigation";
import { Leaf } from "lucide-react";
import { WaiverForm } from "@/components/portal/WaiverForm";

export default function CompleteWaiverPage() {
  const router = useRouter();

  const handleComplete = () => {
    router.push("/portal");
    router.refresh();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-2xl">
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

        {/* Card */}
        <div
          className="rounded-2xl border px-5 sm:px-8 py-6 sm:py-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <WaiverForm onComplete={handleComplete} />
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "#6ab04c" }}
        >
          Protected by Alberta PIPA · AvoVita Wellness
        </p>
      </div>
    </div>
  );
}
