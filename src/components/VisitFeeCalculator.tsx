"use client";

import { MapPin, Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { VisitFeeBreakdown } from "@/types/database";

interface VisitFeeCalculatorProps {
  breakdowns: VisitFeeBreakdown[];
  totalVisitFees: number;
}

export function VisitFeeCalculator({
  breakdowns,
  totalVisitFees,
}: VisitFeeCalculatorProps) {
  if (breakdowns.length === 0) return null;

  return (
    <div
      className="rounded-xl p-4 space-y-3 border"
      style={{
        backgroundColor: "#1a3d22",
        borderColor: "#c4973a",
      }}
    >
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 shrink-0" style={{ color: "#c4973a" }} />
        <h4
          className="font-medium text-sm"
          style={{ color: "#ffffff" }}
        >
          Home Visit Fees
        </h4>
      </div>

      {breakdowns.map((b) => (
        <div key={b.address_key} className="space-y-1.5">
          <p
            className="text-xs font-medium truncate"
            style={{ color: "#e8d5a3" }}
          >
            {b.address_label}
          </p>
          <div
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "#6ab04c" }}
          >
            <Users className="w-3 h-3" />
            <span>
              {b.person_count} person{b.person_count !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-1 text-xs" style={{ color: "#e8d5a3" }}>
            <div className="flex justify-between">
              <span>Base fee (1st person)</span>
              <span>{formatCurrency(b.base_fee)}</span>
            </div>
            {b.additional_fee > 0 && (
              <div className="flex justify-between">
                <span>
                  Additional ({b.person_count - 1} × $
                  {process.env.NEXT_PUBLIC_HOME_VISIT_FEE_ADDITIONAL ?? "55"})
                </span>
                <span>{formatCurrency(b.additional_fee)}</span>
              </div>
            )}
            <div
              className="flex justify-between font-semibold pt-1 border-t"
              style={{ borderColor: "#2d6b35" }}
            >
              <span style={{ color: "#ffffff" }}>Visit total</span>
              <span style={{ color: "#c4973a" }}>
                {formatCurrency(b.total_fee)}
              </span>
            </div>
          </div>
        </div>
      ))}

      {breakdowns.length > 1 && (
        <div
          className="flex justify-between text-sm font-semibold border-t pt-2"
          style={{ borderColor: "#c4973a" }}
        >
          <span style={{ color: "#ffffff" }}>Total visit fees</span>
          <span style={{ color: "#c4973a" }}>
            {formatCurrency(totalVisitFees)}
          </span>
        </div>
      )}

      <p className="text-xs italic" style={{ color: "#6ab04c" }}>
        FloLabs professional phlebotomist visits your home to collect specimens.
      </p>
    </div>
  );
}
