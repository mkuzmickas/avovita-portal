"use client";

import { useState } from "react";
import { FlaskConical, Mail } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { ResultUploader } from "@/components/ResultUploader";
import { DirectDeliveryCard } from "./DirectDeliveryCard";
import type {
  PendingOrderGroup,
  PendingOrderLine,
} from "@/app/(admin)/admin/results/page";

interface ResultsUploadManagerProps {
  initialGroups: PendingOrderGroup[];
}

/**
 * Client-side manager for the admin results upload page. Owns the list of
 * pending order lines so cards can be removed in-place after successful
 * upload / mark-as-notified without triggering a full page reload.
 */
export function ResultsUploadManager({
  initialGroups,
}: ResultsUploadManagerProps) {
  const [groups, setGroups] = useState<PendingOrderGroup[]>(initialGroups);

  const removeLine = (orderLineId: string) => {
    setGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          lines: g.lines.filter((l) => l.id !== orderLineId),
        }))
        .filter((g) => g.lines.length > 0)
    );
  };

  if (groups.length === 0) {
    return (
      <div
        className="rounded-xl border px-6 py-12 text-center"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <p style={{ color: "#6ab04c" }}>
          Nothing to upload right now. New order lines will appear here as
          orders are placed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <OrderGroup key={group.orderId} group={group} onRemoveLine={removeLine} />
      ))}
    </div>
  );
}

function OrderGroup({
  group,
  onRemoveLine,
}: {
  group: PendingOrderGroup;
  onRemoveLine: (id: string) => void;
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      {/* Order header */}
      <div
        className="px-6 py-4 border-b"
        style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="font-mono text-xs"
            style={{ color: "#6ab04c" }}
          >
            Order #{group.orderIdShort}
          </span>
          <span
            className="text-xs"
            style={{ color: "#6ab04c" }}
          >
            ·
          </span>
          <p
            className="text-sm font-semibold"
            style={{ color: "#ffffff" }}
          >
            {group.primaryPatientName}
          </p>
          {group.patientEmail !== "—" && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "#e8d5a3" }}
            >
              <Mail className="w-3 h-3" />
              {group.patientEmail}
            </span>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
          Placed {formatDate(group.createdAt)}
        </p>
      </div>

      {/* Order lines */}
      <div>
        {group.lines.map((line, idx) => (
          <div
            key={line.id}
            className="px-6 py-5"
            style={{
              borderTop: idx > 0 ? "1px solid #2d6b35" : "none",
            }}
          >
            <LineCard line={line} onResolved={() => onRemoveLine(line.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LineCard({
  line,
  onResolved,
}: {
  line: PendingOrderLine;
  onResolved: () => void;
}) {
  const [uploaded, setUploaded] = useState(false);

  const handleSuccess = () => {
    setUploaded(true);
    // Remove card from pending list after 2 seconds
    setTimeout(() => onResolved(), 2000);
  };

  const isDirectDelivery = line.labResultsVisibility === "none";

  return (
    <div>
      {/* Test meta */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
          style={{
            backgroundColor: "#0f2614",
            borderColor: isDirectDelivery ? "#c4973a" : "#2d6b35",
          }}
        >
          <FlaskConical
            className="w-4 h-4"
            style={{ color: isDirectDelivery ? "#c4973a" : "#8dc63f" }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="font-medium text-sm"
            style={{ color: "#ffffff" }}
          >
            {line.testName}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#e8d5a3" }}>
            {line.labName} · For:{" "}
            <strong style={{ color: "#ffffff" }}>{line.profileName}</strong>
            {line.relationshipLabel && (
              <span style={{ color: "#c4973a" }}>
                {" "}
                — {line.relationshipLabel}
              </span>
            )}
          </p>
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs"
            style={{ color: "#6ab04c" }}
          >
            {line.specimenType && <span>{line.specimenType}</span>}
            {line.turnaroundDisplay && (
              <>
                {line.specimenType && <span>·</span>}
                <span>{line.turnaroundDisplay}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action: upload OR direct delivery */}
      {isDirectDelivery ? (
        <DirectDeliveryCard
          orderLineId={line.id}
          labName={line.labName}
          patientName={line.profileName}
          onResolved={handleSuccess}
          resolved={uploaded}
        />
      ) : (
        <ResultUploader
          orderLineId={line.id}
          profileId={line.profileId}
          testName={line.testName}
          patientName={line.profileName}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
