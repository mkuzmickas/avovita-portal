"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  ChevronDown,
  Baby,
  ArrowRight,
  CheckCircle,
  Clock,
  X,
  Star,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type {
  AdminPatientRow,
  AdminPatientProfile,
} from "@/app/(admin)/admin/patients/page";

type WaiverFilter = "all" | "complete" | "pending";
type RepFilter = "all" | "reps" | "direct";

const REP_RELATIONSHIP_LABEL: Record<string, string> = {
  power_of_attorney: "Power of Attorney",
  parent_guardian: "Parent / Guardian",
  spouse_partner: "Spouse / Partner",
  healthcare_worker: "Healthcare Worker",
  other: "Representative",
};

interface AdminPatientsTableProps {
  patients: AdminPatientRow[];
}

export function AdminPatientsTable({ patients }: AdminPatientsTableProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [waiverFilter, setWaiverFilter] = useState<WaiverFilter>("all");
  const [repFilter, setRepFilter] = useState<RepFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Review request state — local overrides keyed by account id so the
  // button flips to "Sent" the moment the request succeeds, without
  // waiting on a server refresh. Seed from the row data on mount.
  const [reviewSentMap, setReviewSentMap] = useState<Record<string, string>>(
    () => {
      const seed: Record<string, string> = {};
      for (const p of patients) {
        if (p.review_request_sent_at) seed[p.id] = p.review_request_sent_at;
      }
      return seed;
    },
  );
  const [confirmReview, setConfirmReview] = useState<AdminPatientRow | null>(
    null,
  );
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccessMessage, setReviewSuccessMessage] = useState<
    string | null
  >(null);

  // Debounce 250ms — typing doesn't re-filter on every keystroke. The
  // raw `searchInput` stays bound to the input so it stays responsive;
  // `debouncedSearch` drives the actual filter.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return patients.filter((p) => {
      // Waiver filter
      if (waiverFilter === "complete" && !p.waiver_completed) return false;
      if (waiverFilter === "pending" && p.waiver_completed) return false;

      // Representative filter
      if (repFilter === "reps" && !p.is_representative) return false;
      if (repFilter === "direct" && p.is_representative) return false;

      // Search
      if (!q) return true;
      if (p.primaryName.toLowerCase().includes(q)) return true;
      if (p.email?.toLowerCase().includes(q)) return true;
      for (const profile of p.profiles) {
        const full = `${profile.first_name} ${profile.last_name}`.toLowerCase();
        if (full.includes(q)) return true;
      }
      return false;
    });
  }, [patients, debouncedSearch, waiverFilter, repFilter]);

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const filterBtnStyle = (active: boolean) => ({
    backgroundColor: active ? "#c4973a" : "transparent",
    color: active ? "#0a1a0d" : "#e8d5a3",
    borderColor: active ? "#c4973a" : "#2d6b35",
  });

  return (
    <>
      {/* Controls: search + waiver filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "#6ab04c" }}
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email..."
            className="mf-input pl-10 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
              style={{ color: "#6ab04c" }}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {(
            [
              { key: "all", label: "All Clients" },
              { key: "complete", label: "Waiver Complete" },
              { key: "pending", label: "Waiver Pending" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setWaiverFilter(key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
              style={filterBtnStyle(waiverFilter === key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {(
            [
              { key: "all", label: "All" },
              { key: "reps", label: "Representatives" },
              { key: "direct", label: "Direct" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setRepFilter(key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
              style={filterBtnStyle(repFilter === key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {[
                  "Name",
                  "Email",
                  "Phone",
                  "Profiles",
                  "Orders",
                  "Waiver",
                  "Member Since",
                  "Review",
                  "",
                ].map((h, i) => (
                  <th
                    key={i}
                    className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider"
                    style={{
                      color: "#c4973a",
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-16 text-center"
                    style={{
                      backgroundColor: "#0a1a0d",
                      color: "#6ab04c",
                    }}
                  >
                    {patients.length === 0 ? (
                      "No clients yet"
                    ) : (
                      <div className="space-y-3">
                        <p>No clients match</p>
                        {searchInput && (
                          <button
                            type="button"
                            onClick={() => setSearchInput("")}
                            className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold border transition-colors"
                            style={{
                              color: "#c4973a",
                              borderColor: "#c4973a",
                              backgroundColor: "transparent",
                            }}
                          >
                            Clear search
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((patient, idx) => {
                  const isExpanded = expandedId === patient.id;
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";

                  return (
                    <PatientRow
                      key={patient.id}
                      patient={patient}
                      rowBg={rowBg}
                      isExpanded={isExpanded}
                      onToggle={() => toggle(patient.id)}
                      reviewSentAt={
                        reviewSentMap[patient.id] ??
                        patient.review_request_sent_at
                      }
                      onRequestReview={() => {
                        setReviewError(null);
                        setConfirmReview(patient);
                      }}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-right" style={{ color: "#6ab04c" }}>
        Showing {filtered.length} of {patients.length} patients
      </p>

      {confirmReview && (
        <ReviewRequestConfirmModal
          client={confirmReview}
          submitting={reviewSubmitting}
          error={reviewError}
          onCancel={() => {
            if (reviewSubmitting) return;
            setConfirmReview(null);
            setReviewError(null);
          }}
          onConfirm={async () => {
            setReviewSubmitting(true);
            setReviewError(null);
            try {
              const res = await fetch(
                `/api/admin/patients/${confirmReview.id}/send-review-request`,
                { method: "POST" },
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setReviewError(
                  data.error ?? "Failed to send review request",
                );
                return;
              }
              setReviewSentMap((prev) => ({
                ...prev,
                [confirmReview.id]:
                  data.review_request_sent_at ?? new Date().toISOString(),
              }));
              const channels = (data.sent_via ?? []) as string[];
              setReviewSuccessMessage(
                `Review request sent via ${channels.join(" + ") || "email"} to ${confirmReview.primaryName}.`,
              );
              setTimeout(() => setReviewSuccessMessage(null), 6000);
              setConfirmReview(null);
            } catch (err) {
              setReviewError(
                err instanceof Error
                  ? err.message
                  : "Failed to send review request",
              );
            } finally {
              setReviewSubmitting(false);
            }
          }}
        />
      )}

      {reviewSuccessMessage && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg"
          style={{
            backgroundColor: "rgba(141, 198, 63, 0.18)",
            borderColor: "#8dc63f",
            color: "#8dc63f",
          }}
          role="status"
        >
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">{reviewSuccessMessage}</span>
        </div>
      )}
    </>
  );
}

// ─── Row + expanded detail ──────────────────────────────────────────────

function PatientRow({
  patient,
  rowBg,
  isExpanded,
  onToggle,
  reviewSentAt,
  onRequestReview,
}: {
  patient: AdminPatientRow;
  rowBg: string;
  isExpanded: boolean;
  onToggle: () => void;
  /** Local-state override of patient.review_request_sent_at — lets the
   *  parent flip the button to "Sent" the moment the request succeeds
   *  without needing a router.refresh(). */
  reviewSentAt: string | null;
  onRequestReview: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer"
        style={{ backgroundColor: rowBg, borderTop: "1px solid #1a3d22" }}
      >
        <td className="px-5 py-4 font-medium" style={{ color: "#ffffff" }}>
          <div>{patient.primaryName}</div>
          {patient.is_representative && (
            <span
              className="inline-flex items-center mt-1 mr-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
              style={{
                backgroundColor: "rgba(196, 151, 58, 0.12)",
                color: "#c4973a",
                borderColor: "#c4973a",
              }}
            >
              Represented
            </span>
          )}
          {patient.org_name && (
            <span
              className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
              style={{
                backgroundColor: `${patient.org_color ?? "#2d6b35"}1f`,
                color: patient.org_color ?? "#8dc63f",
                borderColor: patient.org_color ?? "#2d6b35",
              }}
            >
              via {patient.org_name}
            </span>
          )}
        </td>
        <td className="px-5 py-4" style={{ color: "#e8d5a3" }}>
          {patient.email ?? "—"}
        </td>
        <td className="px-5 py-4" style={{ color: "#e8d5a3" }}>
          {patient.primaryPhone ?? "—"}
        </td>
        <td className="px-5 py-4" style={{ color: "#e8d5a3" }}>
          {patient.profiles.length}
        </td>
        <td className="px-5 py-4" style={{ color: "#c4973a", fontWeight: 600 }}>
          {patient.ordersCount}
        </td>
        <td className="px-5 py-4 whitespace-nowrap">
          {patient.waiver_completed ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" style={{ color: "#8dc63f" }} />
              <div>
                <span className="text-xs font-medium" style={{ color: "#8dc63f" }}>Signed</span>
                {patient.waiver_completed_at && (
                  <p className="text-[10px]" style={{ color: "#6ab04c" }}>
                    {formatDate(patient.waiver_completed_at)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" style={{ color: "#c4973a" }} />
              <span className="text-xs font-medium" style={{ color: "#c4973a" }}>Pending</span>
            </div>
          )}
        </td>
        <td
          className="px-5 py-4 text-xs whitespace-nowrap"
          style={{ color: "#6ab04c" }}
        >
          {formatDate(patient.created_at)}
        </td>
        <td
          className="px-5 py-4 whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <ReviewRequestButton
            sentAt={reviewSentAt}
            hasContactInfo={!!patient.email || !!patient.primaryPhone}
            onClick={onRequestReview}
          />
        </td>
        <td className="px-5 py-4 text-right">
          <ChevronDown
            className="w-4 h-4 inline-block transition-transform duration-200"
            style={{
              color: "#c4973a",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </td>
      </tr>

      {isExpanded && (
        <tr style={{ backgroundColor: rowBg }}>
          <td colSpan={9} className="p-0">
            <div
              className="px-6 py-5 border-t"
              style={{
                borderColor: "#2d6b35",
                backgroundColor: "#0f2614",
              }}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <h3
                  className="font-heading text-lg font-semibold"
                  style={{
                    color: "#ffffff",
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                  }}
                >
                  Profiles on this account
                </h3>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Link
                    href={`/admin/patients/${patient.id}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
                    style={{
                      backgroundColor: "transparent",
                      borderColor: "#c4973a",
                      color: "#c4973a",
                    }}
                  >
                    Open Profile
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href={`/admin/orders?patient_id=${patient.id}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                  >
                    View Orders
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {patient.profiles.length === 0 ? (
                <p className="text-sm" style={{ color: "#6ab04c" }}>
                  No profiles on this account yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {patient.profiles.map((profile) => (
                    <ProfileCard key={profile.id} profile={profile} />
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ProfileCard({ profile }: { profile: AdminPatientProfile }) {
  const addressLine = [
    profile.address_line1,
    profile.address_line2,
    profile.city,
    profile.province,
    profile.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h4 className="font-semibold" style={{ color: "#ffffff" }}>
          {profile.first_name} {profile.last_name}
        </h4>
        {profile.is_primary && (
          <span
            className="text-xs px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: "rgba(196, 151, 58, 0.125)",
              color: "#c4973a",
              borderColor: "#c4973a",
            }}
          >
            Primary
          </span>
        )}
        {profile.is_dependent && (
          <span
            className="text-xs px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: "rgba(196, 151, 58, 0.12)",
              color: "#c4973a",
              borderColor: "#c4973a",
            }}
            title={
              profile.relationship
                ? `Client — represented by ${REP_RELATIONSHIP_LABEL[profile.relationship] ?? profile.relationship}`
                : "Represented client"
            }
          >
            Dependent
            {profile.relationship
              ? ` · ${REP_RELATIONSHIP_LABEL[profile.relationship] ?? profile.relationship}`
              : ""}
          </span>
        )}
        {profile.is_minor && (
          <span
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: "rgba(141, 198, 63, 0.125)",
              color: "#8dc63f",
              borderColor: "#8dc63f",
            }}
          >
            <Baby className="w-3 h-3" />
            Minor
          </span>
        )}
      </div>

      <dl
        className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs"
        style={{ color: "#e8d5a3" }}
      >
        <div>
          <dt style={{ color: "#6ab04c" }}>DOB</dt>
          <dd>{formatDate(profile.date_of_birth)}</dd>
        </div>
        <div>
          <dt style={{ color: "#6ab04c" }}>Sex</dt>
          <dd className="capitalize">{profile.biological_sex}</dd>
        </div>
        {profile.phone && (
          <div className="col-span-2">
            <dt style={{ color: "#6ab04c" }}>Phone</dt>
            <dd>{profile.phone}</dd>
          </div>
        )}
        {addressLine && (
          <div className="col-span-2">
            <dt style={{ color: "#6ab04c" }}>Address</dt>
            <dd className="truncate">{addressLine}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ─── Review request button + confirmation modal ─────────────────────────

function ReviewRequestButton({
  sentAt,
  hasContactInfo,
  onClick,
}: {
  sentAt: string | null;
  hasContactInfo: boolean;
  onClick: () => void;
}) {
  if (sentAt) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
        style={{
          color: "#6b7280",
          borderColor: "#2d6b35",
          backgroundColor: "rgba(107, 114, 128, 0.08)",
          cursor: "default",
        }}
        title={`Sent ${formatDate(sentAt)}`}
      >
        <Star className="w-3.5 h-3.5" />
        Sent
      </span>
    );
  }
  if (!hasContactInfo) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
        style={{
          color: "#6b7280",
          borderColor: "#2d6b35",
          backgroundColor: "transparent",
          cursor: "not-allowed",
        }}
        title="No contact info on file"
      >
        <Star className="w-3.5 h-3.5" />
        Send
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
      style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
    >
      <Star className="w-3.5 h-3.5" />
      Send
    </button>
  );
}

function ReviewRequestConfirmModal({
  client,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  client: AdminPatientRow;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Lock body scroll + Escape closes (when not submitting).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel, submitting]);

  const hasEmail = !!client.email;
  const hasPhone = !!client.primaryPhone;
  const channels: string[] = [];
  if (hasEmail) channels.push("email");
  if (hasPhone) channels.push("SMS");
  const channelText =
    channels.length === 2
      ? "email and SMS"
      : channels.length === 1
        ? channels[0]
        : "email or SMS";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={() => {
        if (!submitting) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="font-heading text-xl font-semibold mb-3"
          style={{
            color: "#c4973a",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Send Google Review Request?
        </h2>
        <p className="text-sm" style={{ color: "#e8d5a3" }}>
          Send Google review request to{" "}
          <strong style={{ color: "#ffffff" }}>{client.primaryName}</strong>{" "}
          via {channelText}?
        </p>
        {!hasPhone && hasEmail && (
          <p className="text-xs italic mt-2" style={{ color: "#c4973a" }}>
            This client has no phone number — email only will be sent.
          </p>
        )}
        {!hasEmail && hasPhone && (
          <p className="text-xs italic mt-2" style={{ color: "#c4973a" }}>
            This client has no email on file — SMS only will be sent.
          </p>
        )}

        {error && (
          <div
            className="flex items-start gap-2 mt-4 p-3 rounded-lg border text-sm"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.12)",
              borderColor: "#e05252",
              color: "#e05252",
            }}
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              color: "#e8d5a3",
              borderColor: "#2d6b35",
              backgroundColor: "transparent",
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              backgroundColor: "#c4973a",
              color: "#0a1a0d",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
