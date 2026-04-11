"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeVisitFees } from "@/lib/checkout/visit-fees";
import type {
  CheckoutPerson,
  CollectionAddress,
} from "@/lib/checkout/types";
import type { PersonAssignmentEntry } from "./Step2AssignTests";

interface Step3Props {
  persons: CheckoutPerson[];
  collectionAddress: CollectionAddress;
  assignments: PersonAssignmentEntry[];
  onPersonsChange: (next: CheckoutPerson[]) => void;
  onAddressChange: (next: CollectionAddress) => void;
  onBack: () => void;
  onContinue: () => void;
}

const CA_PROVINCES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
];

const RELATIONSHIP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "spouse_partner", label: "Spouse / Partner" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "friend", label: "Friend" },
  { value: "colleague", label: "Colleague" },
  { value: "other", label: "Other" },
];

export function Step3CollectionDetails({
  persons,
  collectionAddress,
  assignments,
  onPersonsChange,
  onAddressChange,
  onBack,
  onContinue,
}: Step3Props) {
  const visitFees = useMemo(
    () => computeVisitFees(persons.length),
    [persons.length]
  );

  const updatePerson = (index: number, patch: Partial<CheckoutPerson>) => {
    onPersonsChange(
      persons.map((p) => (p.index === index ? { ...p, ...patch } : p))
    );
  };

  // Validation
  const addressValid =
    collectionAddress.address_line1.trim().length > 0 &&
    collectionAddress.city.trim().length > 0 &&
    collectionAddress.province.trim().length > 0 &&
    collectionAddress.postal_code.trim().length > 0;

  const accountHolder = persons[0];
  const accountHolderValid =
    accountHolder?.first_name.trim().length > 0 &&
    accountHolder?.last_name.trim().length > 0 &&
    accountHolder?.date_of_birth.length > 0 &&
    accountHolder?.biological_sex !== "";

  const additionalPersons = persons.slice(1);
  const additionalAllValid = additionalPersons.every(
    (p) =>
      p.first_name.trim().length > 0 &&
      p.last_name.trim().length > 0 &&
      p.date_of_birth.length > 0 &&
      p.biological_sex !== "" &&
      p.relationship !== null
  );

  const allConsentsObtained = additionalPersons.every(
    (p) => p.consent_acknowledged
  );

  const canContinue =
    addressValid &&
    accountHolderValid &&
    additionalAllValid &&
    allConsentsObtained;

  const labelStyle = { color: "#e8d5a3" };
  const reqMark = <span style={{ color: "#e05252" }}> *</span>;

  return (
    <div
      className="rounded-2xl border p-5 sm:p-7"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-5 h-5" style={{ color: "#c4973a" }} />
        <p
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: "#c4973a" }}
        >
          Step 3 of 4
        </p>
      </div>

      <h1
        className="font-heading text-2xl sm:text-3xl font-semibold mb-6"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Collection <span style={{ color: "#c4973a" }}>Details</span>
      </h1>

      {/* ─── Collection Address ──────────────────────────────────── */}
      <section className="mb-8">
        <h2
          className="font-heading text-xl font-semibold mb-1"
          style={{
            color: "#c4973a",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Collection Address
        </h2>
        <p className="text-xs mb-5" style={{ color: "#e8d5a3" }}>
          This is where your FloLabs phlebotomist will come to collect
          specimens. This may be your home, a hotel, office, or any
          Calgary-area address. All people in this order must be at this
          address at the time of collection.
        </p>

        <div className="space-y-3">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={labelStyle}
            >
              Address Line 1{reqMark}
            </label>
            <input
              type="text"
              value={collectionAddress.address_line1}
              onChange={(e) =>
                onAddressChange({
                  ...collectionAddress,
                  address_line1: e.target.value,
                })
              }
              className="mf-input"
              autoComplete="address-line1"
              placeholder="123 Main St"
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={labelStyle}
            >
              Address Line 2
            </label>
            <input
              type="text"
              value={collectionAddress.address_line2}
              onChange={(e) =>
                onAddressChange({
                  ...collectionAddress,
                  address_line2: e.target.value,
                })
              }
              className="mf-input"
              autoComplete="address-line2"
              placeholder="Suite, Unit, Apt #"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={labelStyle}
              >
                City{reqMark}
              </label>
              <input
                type="text"
                value={collectionAddress.city}
                onChange={(e) =>
                  onAddressChange({
                    ...collectionAddress,
                    city: e.target.value,
                  })
                }
                className="mf-input"
                autoComplete="address-level2"
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={labelStyle}
              >
                Province{reqMark}
              </label>
              <select
                value={collectionAddress.province}
                onChange={(e) =>
                  onAddressChange({
                    ...collectionAddress,
                    province: e.target.value,
                  })
                }
                className="mf-input cursor-pointer"
              >
                {CA_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={labelStyle}
              >
                Postal Code{reqMark}
              </label>
              <input
                type="text"
                value={collectionAddress.postal_code}
                onChange={(e) =>
                  onAddressChange({
                    ...collectionAddress,
                    postal_code: e.target.value.toUpperCase(),
                  })
                }
                className="mf-input"
                autoComplete="postal-code"
                placeholder="T2P 1A1"
                maxLength={7}
              />
            </div>
          </div>
        </div>

        {/* Hard block warning */}
        <div
          className="flex items-start gap-2 rounded-lg border px-4 py-3 mt-4"
          style={{
            backgroundColor: "rgba(196, 151, 58, 0.1)",
            borderColor: "#c4973a",
          }}
        >
          <AlertTriangle
            className="w-4 h-4 shrink-0 mt-0.5"
            style={{ color: "#c4973a" }}
          />
          <p className="text-xs" style={{ color: "#c4973a" }}>
            All people in this order must be at this collection address.
            If any person requires collection at a different address,
            please place a separate order for them.
          </p>
        </div>
      </section>

      {/* ─── Person 1 (You) ────────────────────────────────────── */}
      {accountHolder && (
        <PersonSection
          title="Your Information"
          subtitle="These fields will be used to create your patient profile after checkout."
          person={accountHolder}
          onChange={(patch) => updatePerson(0, patch)}
          isAccountHolder
          assignments={assignments.filter((a) => a.person_index === 0)}
          showRelationship={false}
          showConsent={false}
        />
      )}

      {/* ─── Additional People ─────────────────────────────────── */}
      {additionalPersons.map((person) => {
        const personAssignments = assignments.filter(
          (a) => a.person_index === person.index
        );
        const testNamesPreview =
          personAssignments.length > 0
            ? ` — ${personAssignments.map((a) => a.test_name).join(", ")}`
            : "";
        return (
          <PersonSection
            key={person.index}
            title={`Person ${person.index + 1}${testNamesPreview}`}
            subtitle={null}
            person={person}
            onChange={(patch) => updatePerson(person.index, patch)}
            isAccountHolder={false}
            assignments={personAssignments}
            showRelationship
            showConsent
          />
        );
      })}

      {/* ─── Visit fee preview ─────────────────────────────────── */}
      <section
        className="rounded-xl border p-5 mt-2"
        style={{
          backgroundColor: "#0f2614",
          borderColor: "#2d6b35",
        }}
      >
        <h3
          className="font-heading text-lg font-semibold mb-3"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Home Visit Fee
        </h3>

        <div className="space-y-1.5 text-sm">
          <div
            className="flex justify-between"
            style={{ color: "#e8d5a3" }}
          >
            <span>Base fee (1st person)</span>
            <span>{formatCurrency(visitFees.base_fee)}</span>
          </div>
          {visitFees.additional_person_count > 0 && (
            <div
              className="flex justify-between"
              style={{ color: "#e8d5a3" }}
            >
              <span>
                Additional people ({visitFees.additional_person_count} ×{" "}
                {formatCurrency(visitFees.additional_fee_per_person)})
              </span>
              <span>
                {formatCurrency(
                  visitFees.additional_fee_per_person *
                    visitFees.additional_person_count
                )}
              </span>
            </div>
          )}
          <div
            className="flex justify-between font-semibold pt-2 border-t mt-2"
            style={{ borderColor: "#2d6b35" }}
          >
            <span style={{ color: "#ffffff" }}>Total visit fee</span>
            <span style={{ color: "#c4973a" }}>
              {formatCurrency(visitFees.total)}
            </span>
          </div>
        </div>
      </section>

      {/* ─── Validation block + nav ────────────────────────────── */}
      <div
        className="mt-6 pt-5 border-t"
        style={{ borderColor: "#2d6b35" }}
      >
        {!allConsentsObtained && additionalPersons.length > 0 && (
          <div
            className="flex items-start gap-2 rounded-lg border px-4 py-3 mb-4 text-sm"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.12)",
              borderColor: "#e05252",
              color: "#e05252",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              All additional people must consent to sharing your account
              before you can proceed. If individual accounts are required,
              please place separate orders.
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mf-btn-secondary px-5 py-2.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="mf-btn-primary px-5 py-2.5 sm:flex-1 sm:max-w-xs"
          >
            Continue to Review
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Person section subcomponent ───────────────────────────────────────

function PersonSection({
  title,
  subtitle,
  person,
  onChange,
  isAccountHolder,
  assignments,
  showRelationship,
  showConsent,
}: {
  title: string;
  subtitle: string | null;
  person: CheckoutPerson;
  onChange: (patch: Partial<CheckoutPerson>) => void;
  isAccountHolder: boolean;
  assignments: PersonAssignmentEntry[];
  showRelationship: boolean;
  showConsent: boolean;
}) {
  const labelStyle = { color: "#e8d5a3" };
  const reqMark = <span style={{ color: "#e05252" }}> *</span>;

  return (
    <section
      className="mb-6 pb-6 border-b"
      style={{ borderColor: "#2d6b35" }}
    >
      <h2
        className="font-heading text-xl font-semibold mb-1"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-xs mb-4" style={{ color: "#6ab04c" }}>
          {subtitle}
        </p>
      )}
      {!isAccountHolder && assignments.length > 0 && (
        <p className="text-xs mb-4" style={{ color: "#8dc63f" }}>
          {assignments.length} test{assignments.length !== 1 ? "s" : ""}{" "}
          assigned
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={labelStyle}
          >
            First Name{reqMark}
          </label>
          <input
            type="text"
            value={person.first_name}
            onChange={(e) => onChange({ first_name: e.target.value })}
            className="mf-input"
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={labelStyle}
          >
            Last Name{reqMark}
          </label>
          <input
            type="text"
            value={person.last_name}
            onChange={(e) => onChange({ last_name: e.target.value })}
            className="mf-input"
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={labelStyle}
          >
            Date of Birth{reqMark}
          </label>
          <input
            type="date"
            value={person.date_of_birth}
            onChange={(e) => onChange({ date_of_birth: e.target.value })}
            className="mf-input"
            style={{ colorScheme: "dark" }}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={labelStyle}
          >
            Biological Sex{reqMark}
          </label>
          <select
            value={person.biological_sex}
            onChange={(e) =>
              onChange({
                biological_sex: e.target.value as
                  | "male"
                  | "female"
                  | "intersex"
                  | "",
              })
            }
            className="mf-input cursor-pointer"
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="intersex">Intersex</option>
          </select>
        </div>
      </div>

      {showRelationship && (
        <div className="mt-3">
          <label
            className="block text-sm font-medium mb-1.5"
            style={labelStyle}
          >
            Relationship to account holder{reqMark}
          </label>
          <select
            value={person.relationship ?? ""}
            onChange={(e) =>
              onChange({
                relationship: (e.target.value || null) as
                  | typeof person.relationship,
              })
            }
            className="mf-input cursor-pointer"
          >
            <option value="">Select…</option>
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showConsent && (
        <div
          className="mt-4 rounded-lg border p-4"
          style={{
            backgroundColor: person.consent_acknowledged
              ? "rgba(141, 198, 63, 0.08)"
              : "#0f2614",
            borderColor: person.consent_acknowledged
              ? "#8dc63f"
              : "#c4973a",
          }}
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={person.consent_acknowledged}
              onChange={(e) =>
                onChange({ consent_acknowledged: e.target.checked })
              }
              className="w-5 h-5 rounded mt-0.5 shrink-0"
              style={{ accentColor: "#c4973a" }}
            />
            <span className="text-sm" style={{ color: "#e8d5a3" }}>
              I confirm that{" "}
              <strong style={{ color: "#ffffff" }}>
                {person.first_name.trim() || "this person"}
              </strong>{" "}
              consents to their specimen being collected and tested, and
              agrees to have their results uploaded to my AvoVita account
              where I will have access to view them.
            </span>
          </label>
          <p
            className="text-xs mt-3 ml-8"
            style={{ color: "#6ab04c" }}
          >
            If this person requires a private individual account, please
            remove their tests from this cart and have them place a
            separate order.
          </p>
        </div>
      )}
    </section>
  );
}
