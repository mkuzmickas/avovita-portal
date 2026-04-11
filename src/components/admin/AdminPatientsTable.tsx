"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronDown, Baby, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type {
  AdminPatientRow,
  AdminPatientProfile,
} from "@/app/(admin)/admin/patients/page";

interface AdminPatientsTableProps {
  patients: AdminPatientRow[];
}

export function AdminPatientsTable({ patients }: AdminPatientsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      if (p.primaryName.toLowerCase().includes(q)) return true;
      if (p.email?.toLowerCase().includes(q)) return true;
      for (const profile of p.profiles) {
        const full = `${profile.first_name} ${profile.last_name}`.toLowerCase();
        if (full.includes(q)) return true;
      }
      return false;
    });
  }, [patients, searchQuery]);

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "#6ab04c" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient name or email…"
            className="mf-input pl-10"
          />
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
                  "Member Since",
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
                    colSpan={7}
                    className="px-6 py-16 text-center"
                    style={{
                      backgroundColor: "#0a1a0d",
                      color: "#6ab04c",
                    }}
                  >
                    {patients.length === 0
                      ? "No patients yet"
                      : "No patients match your search"}
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
    </>
  );
}

// ─── Row + expanded detail ──────────────────────────────────────────────

function PatientRow({
  patient,
  rowBg,
  isExpanded,
  onToggle,
}: {
  patient: AdminPatientRow;
  rowBg: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer"
        style={{ backgroundColor: rowBg, borderTop: "1px solid #1a3d22" }}
      >
        <td className="px-5 py-4 font-medium" style={{ color: "#ffffff" }}>
          {patient.primaryName}
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
        <td
          className="px-5 py-4 text-xs whitespace-nowrap"
          style={{ color: "#6ab04c" }}
        >
          {formatDate(patient.created_at)}
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
          <td colSpan={7} className="p-0">
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
                <Link
                  href={`/admin/orders?patient_id=${patient.id}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0"
                  style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                >
                  View Orders
                  <ArrowRight className="w-4 h-4" />
                </Link>
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
