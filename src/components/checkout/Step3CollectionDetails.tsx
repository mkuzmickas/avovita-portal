"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { computeVisitFees, classifyPostalZone } from "@/lib/checkout/visit-fees";
import { AddressAutocompleteInput } from "./AddressAutocompleteInput";
import { DiscountBanner } from "./DiscountBanner";
import type {
  CheckoutPerson,
  CollectionAddress,
} from "@/lib/checkout/types";
import type { PersonAssignmentEntry } from "./Step2AssignTests";
import type { OrderMode } from "./CheckoutClient";
import type { RepresentativeBlock } from "@/lib/checkout/types";

interface Step3Props {
  persons: CheckoutPerson[];
  collectionAddress: CollectionAddress;
  assignments: PersonAssignmentEntry[];
  onPersonsChange: (next: CheckoutPerson[]) => void;
  onAddressChange: (next: CollectionAddress) => void;
  onBack: () => void;
  onContinue: () => void;
  orderMode: OrderMode;
  representative: RepresentativeBlock;
  onRepresentativeChange: (next: RepresentativeBlock) => void;
}

const REP_RELATIONSHIP_OPTIONS: Array<{
  value: RepresentativeBlock["relationship"];
  label: string;
}> = [
  { value: "power_of_attorney", label: "Power of Attorney" },
  { value: "parent_guardian", label: "Parent / Guardian" },
  { value: "spouse_partner", label: "Spouse / Partner" },
  { value: "healthcare_worker", label: "Healthcare Worker" },
  { value: "other", label: "Other" },
];

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
  orderMode,
  representative,
  onRepresentativeChange,
  onBack,
  onContinue,
}: Step3Props) {
  const visitFees = useMemo(
    () => computeVisitFees(persons.length, collectionAddress.postal_code),
    [persons.length, collectionAddress.postal_code]
  );

  const updatePerson = (index: number, patch: Partial<CheckoutPerson>) => {
    onPersonsChange(
      persons.map((p) => (p.index === index ? { ...p, ...patch } : p))
    );
  };

  // Pre-fill account holder fields from their existing patient profile
  const [profilePrefilled, setProfilePrefilled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const prefillFromProfile = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;

      const { data: profileRaw } = await supabase
        .from("patient_profiles")
        .select("first_name, last_name, date_of_birth, biological_sex")
        .eq("account_id", user.id)
        .eq("is_primary", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!profileRaw || cancelled) return;

      const profile = profileRaw as {
        first_name: string;
        last_name: string;
        date_of_birth: string;
        biological_sex: string;
      };

      const patch: Partial<CheckoutPerson> = {
        first_name: profile.first_name,
        last_name: profile.last_name,
        date_of_birth: profile.date_of_birth,
        biological_sex: profile.biological_sex as "male" | "female" | "intersex" | "",
      };

      if (!cancelled) {
        updatePerson(0, patch);
        setProfilePrefilled(true);
      }
    };

    prefillFromProfile();

    return () => {
      cancelled = true;
    };
    // Run once on mount — persons[0] is intentionally read but not a dep
    // to avoid re-fetching on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    accountHolder?.biological_sex !== "" &&
    !!accountHolder?.phone &&
    accountHolder.phone.trim().length > 0;

  const additionalPersons = persons.slice(1);
  const additionalAllValid = additionalPersons.every(
    (p) =>
      p.first_name.trim().length > 0 &&
      p.last_name.trim().length > 0 &&
      p.date_of_birth.length > 0 &&
      p.biological_sex !== "" &&
      p.relationship !== null
  );

  const isEmailValid = (email: string | undefined) =>
    !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const allConsentsObtained = additionalPersons.every(
    (p) =>
      p.consent_acknowledged ||
      (p.wants_own_account && isEmailValid(p.own_account_email))
  );

  const postalZone = classifyPostalZone(collectionAddress.postal_code);
  // Only treat as "unserved error" once the user has typed a full-ish
  // postal code — showing the error while they're typing the first letter
  // is noisy. Three chars is the full FSA prefix.
  const postalEntered =
    collectionAddress.postal_code.replace(/\s+/g, "").length >= 3;
  const zoneUnserved = postalEntered && postalZone === "unserved";

  const isCaregiver = orderMode === "caregiver";
  const representativeValid =
    !isCaregiver ||
    (representative.first_name.trim().length > 0 &&
      representative.last_name.trim().length > 0 &&
      isEmailValid(representative.email) &&
      representative.phone.trim().length > 0 &&
      representative.poa_confirmed);

  // In caregiver mode, "persons" are dependents — they don't need phone
  // (notifications go to the rep) and don't need to tick consent for
  // others because the rep's POA checkbox covers legal authority.
  const dependentsValid =
    !isCaregiver ||
    persons.every(
      (p) =>
        p.first_name.trim().length > 0 &&
        p.last_name.trim().length > 0 &&
        p.date_of_birth.length > 0 &&
        p.biological_sex !== ""
    );

  const canContinue =
    addressValid &&
    (isCaregiver ? representativeValid && dependentsValid : accountHolderValid && additionalAllValid && allConsentsObtained) &&
    !zoneUnserved;

  // Compute a human-readable list of what's still missing so the
  // greyed-out Continue button isn't a mystery.
  const missingFields: string[] = [];
  if (!addressValid) missingFields.push("collection address");
  if (zoneUnserved) missingFields.push("a serviced postal code");
  if (isCaregiver) {
    if (!representativeValid) {
      const repMissing: string[] = [];
      if (!representative.first_name.trim()) repMissing.push("first name");
      if (!representative.last_name.trim()) repMissing.push("last name");
      if (!isEmailValid(representative.email)) repMissing.push("email");
      if (!representative.phone.trim()) repMissing.push("mobile number");
      if (!representative.poa_confirmed)
        repMissing.push("POA acknowledgement");
      missingFields.push(`representative ${repMissing.join(", ")}`);
    }
    if (!dependentsValid) {
      missingFields.push("client first/last name, DOB, biological sex");
    }
  } else {
    if (!accountHolderValid) {
      const ahMissing: string[] = [];
      if (!accountHolder?.first_name.trim()) ahMissing.push("first name");
      if (!accountHolder?.last_name.trim()) ahMissing.push("last name");
      if (!accountHolder?.date_of_birth) ahMissing.push("date of birth");
      if (!accountHolder?.biological_sex) ahMissing.push("biological sex");
      if (!accountHolder?.phone || !accountHolder.phone.trim())
        ahMissing.push("mobile number");
      missingFields.push(`your ${ahMissing.join(", ")}`);
    }
    if (!additionalAllValid) {
      missingFields.push("each additional person's name, DOB, sex, relationship");
    }
    if (!allConsentsObtained && additionalPersons.length > 0) {
      missingFields.push("consent for additional people");
    }
  }

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
        className="font-heading text-2xl sm:text-3xl font-semibold mb-4"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Collection <span style={{ color: "#c4973a" }}>Details</span>
      </h1>

      {/* Multi-test discount banner */}
      {assignments.length >= 2 && (
        <div className="mb-6">
          <DiscountBanner lineCount={assignments.length} />
        </div>
      )}

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
        <p className="text-xs mb-2" style={{ color: "#e8d5a3" }}>
          This is where your FloLabs phlebotomist will come to collect
          specimens. This may be your home, a hotel, office, or any
          Calgary-area address. All people in this order must be at this
          address at the time of collection.
        </p>
        <p className="text-xs mb-5" style={{ color: "#e8d5a3" }}>
          This is where your FloLabs phlebotomist will attend for your
          home visit. Please ensure someone will be present at this
          address at the time of your appointment.
        </p>

        <div className="space-y-3">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={labelStyle}
            >
              Address Line 1{reqMark}
            </label>
            <AddressAutocompleteInput
              value={collectionAddress.address_line1}
              onChange={(next) =>
                onAddressChange({
                  ...collectionAddress,
                  address_line1: next,
                })
              }
              onPlaceSelected={(parsed) =>
                onAddressChange({
                  ...collectionAddress,
                  address_line1: parsed.address_line1 || collectionAddress.address_line1,
                  city: parsed.city || collectionAddress.city,
                  province: parsed.province || collectionAddress.province,
                  postal_code:
                    parsed.postal_code || collectionAddress.postal_code,
                })
              }
              className="mf-input"
              placeholder="Start typing your address…"
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

        {/* Zone validation feedback */}
        {zoneUnserved && (
          <div
            className="flex items-start gap-2 rounded-lg border px-4 py-3 mt-3"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.12)",
              borderColor: "#e05252",
              color: "#e05252",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              Sorry, home collection is not currently available in your area.
              Please contact us at{" "}
              <a
                href="mailto:support@avovita.ca"
                className="font-semibold underline"
                style={{ color: "#e05252" }}
              >
                support@avovita.ca
              </a>{" "}
              to discuss options.
            </p>
          </div>
        )}
        {postalEntered && postalZone === "zone2" && (
          <div
            className="flex items-start gap-2 rounded-lg border px-4 py-3 mt-3"
            style={{
              backgroundColor: "rgba(196, 151, 58, 0.1)",
              borderColor: "#c4973a",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#c4973a" }} />
            <p className="text-sm leading-relaxed" style={{ color: "#e8d5a3" }}>
              Outside Calgary — a{" "}
              <strong style={{ color: "#c4973a" }}>
                ${(visitFees.base_fee - 85).toFixed(0)} travel surcharge
              </strong>{" "}
              is added to your home visit fee.
            </p>
          </div>
        )}

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
      {profilePrefilled && (
        <div
          className="flex items-start gap-2.5 rounded-lg border px-4 py-3 mb-4"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <CheckCircle
            className="w-4 h-4 shrink-0 mt-0.5"
            style={{ color: "#8dc63f" }}
          />
          <p className="text-sm" style={{ color: "#e8d5a3" }}>
            We&apos;ve pre-filled your information from your profile.
          </p>
        </div>
      )}
      {isCaregiver && (
        <RepresentativeSection
          rep={representative}
          onChange={onRepresentativeChange}
        />
      )}
      {accountHolder && (
        <PersonSection
          title={isCaregiver ? "Client 1" : "Your Information"}
          subtitle={
            isCaregiver
              ? "Primary client being tested. Results will be filed under this client's profile."
              : "These fields will be used to create your client profile after checkout."
          }
          person={accountHolder}
          onChange={(patch) => updatePerson(0, patch)}
          isAccountHolder
          hideContactFields={isCaregiver}
          assignments={assignments.filter((a) => a.person_index === 0)}
          showRelationship={false}
          showConsent={false}
        />
      )}

      {/* ─── Additional People ─── (or dependent clients, if caregiver) */}
      {additionalPersons.map((person) => {
        const personAssignments = assignments.filter(
          (a) => a.person_index === person.index
        );
        const testNamesPreview =
          personAssignments.length > 0
            ? ` — ${personAssignments.map((a) => a.test_name).join(", ")}`
            : "";
        const title = isCaregiver
          ? `Client ${person.index + 1}${testNamesPreview}`
          : `Person ${person.index + 1}${testNamesPreview}`;
        return (
          <PersonSection
            key={person.index}
            title={title}
            subtitle={null}
            person={person}
            onChange={(patch) => updatePerson(person.index, patch)}
            isAccountHolder={false}
            hideContactFields={isCaregiver}
            assignments={personAssignments}
            showRelationship={!isCaregiver}
            showConsent={!isCaregiver}
            accountHolderFirstName={accountHolder?.first_name}
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

        {!canContinue && missingFields.length > 0 && (
          <div
            className="flex items-start gap-2 rounded-lg border px-4 py-3 mb-4 text-sm"
            style={{
              backgroundColor: "rgba(196, 151, 58, 0.10)",
              borderColor: "#c4973a",
              color: "#e8d5a3",
            }}
          >
            <AlertCircle
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{ color: "#c4973a" }}
            />
            <span>
              <span className="font-semibold" style={{ color: "#c4973a" }}>
                To continue:
              </span>{" "}
              please complete {missingFields.join("; ")}.
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
  hideContactFields = false,
  assignments,
  showRelationship,
  showConsent,
  accountHolderFirstName,
}: {
  title: string;
  subtitle: string | null;
  person: CheckoutPerson;
  onChange: (patch: Partial<CheckoutPerson>) => void;
  isAccountHolder: boolean;
  /** In caregiver mode, dependents don't carry their own contact info —
   *  all notifications go to the rep. Hide the phone field (and any
   *  own-account-email prompt) when this is true. */
  hideContactFields?: boolean;
  assignments: PersonAssignmentEntry[];
  showRelationship: boolean;
  showConsent: boolean;
  accountHolderFirstName?: string;
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
          <DobDropdowns
            value={person.date_of_birth}
            onChange={(v) => onChange({ date_of_birth: v })}
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
          </select>
        </div>
      </div>

      {!showRelationship && !hideContactFields && (
        <div className="mt-3">
          <label
            className="block text-sm font-medium mb-1.5"
            style={labelStyle}
          >
            Mobile Number{reqMark}
          </label>
          <input
            type="tel"
            required
            value={person.phone ?? ""}
            onChange={(e) => onChange({ phone: e.target.value || null })}
            className="mf-input"
            placeholder="+1 (403) 555-0000"
            autoComplete="tel"
          />
          <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
            Required for SMS notifications when your order ships and results are ready
          </p>
        </div>
      )}

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
        <div className="mt-4 space-y-3">
          {/* Option A — share account */}
          <button
            type="button"
            onClick={() =>
              onChange({
                wants_own_account: false,
                consent_acknowledged: true,
                own_account_email: "",
              })
            }
            className="w-full text-left rounded-lg border p-4 transition-colors"
            style={{
              backgroundColor:
                person.consent_acknowledged && !person.wants_own_account
                  ? "rgba(141, 198, 63, 0.08)"
                  : "#0f2614",
              borderColor:
                person.consent_acknowledged && !person.wants_own_account
                  ? "#8dc63f"
                  : "#2d6b35",
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center"
                style={{
                  borderColor:
                    person.consent_acknowledged && !person.wants_own_account
                      ? "#8dc63f"
                      : "#2d6b35",
                }}
              >
                {person.consent_acknowledged && !person.wants_own_account && (
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: "#8dc63f" }}
                  />
                )}
              </span>
              <div>
                <p
                  className="text-sm font-semibold mb-1"
                  style={{ color: "#c4973a" }}
                >
                  Add results to {accountHolderFirstName || "the account holder"}&apos;s account
                </p>
                <p className="text-xs" style={{ color: "#e8d5a3" }}>
                  I confirm that{" "}
                  <strong style={{ color: "#ffffff" }}>
                    {person.first_name.trim() || "this person"}
                  </strong>{" "}
                  consents to their specimen being collected and tested, and
                  agrees to have their results uploaded to{" "}
                  {accountHolderFirstName || "the account holder"}&apos;s
                  AvoVita account where they will have access to view them.
                </p>
              </div>
            </div>
          </button>

          {/* Option B — own account */}
          <button
            type="button"
            onClick={() =>
              onChange({
                wants_own_account: true,
                consent_acknowledged: true,
              })
            }
            className="w-full text-left rounded-lg border p-4 transition-colors"
            style={{
              backgroundColor: person.wants_own_account
                ? "rgba(141, 198, 63, 0.08)"
                : "#0f2614",
              borderColor: person.wants_own_account
                ? "#8dc63f"
                : "#2d6b35",
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center"
                style={{
                  borderColor: person.wants_own_account
                    ? "#8dc63f"
                    : "#2d6b35",
                }}
              >
                {person.wants_own_account && (
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: "#8dc63f" }}
                  />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold mb-1"
                  style={{ color: "#c4973a" }}
                >
                  I&apos;ll create my own account
                </p>
                <p className="text-xs" style={{ color: "#e8d5a3" }}>
                  {person.first_name.trim() || "This person"} will receive
                  their own login to view results privately.
                </p>
              </div>
            </div>
          </button>

          {/* Email input — shown when own account selected */}
          {person.wants_own_account && (
            <div
              className="rounded-lg border p-4"
              style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
              onClick={(e) => e.stopPropagation()}
            >
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "#e8d5a3" }}
              >
                Your email address <span style={{ color: "#e05252" }}>*</span>
              </label>
              <input
                type="email"
                value={person.own_account_email ?? ""}
                onChange={(e) =>
                  onChange({ own_account_email: e.target.value })
                }
                placeholder="their.email@example.com"
                className="mf-input"
                onClick={(e) => e.stopPropagation()}
              />
              <p className="text-xs mt-2" style={{ color: "#6ab04c" }}>
                We&apos;ll send them an invite to set up their password and
                access their results.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Date of birth dropdowns (Day / Month / Year) ────────────────────────
//
// Replaces the native <input type="date"> with three dropdowns to keep the
// UX consistent across browsers (mobile especially) and avoid the dd/mm
// vs mm/dd ambiguity. Emits an ISO YYYY-MM-DD string only when all three
// parts are filled — partial selections emit "" so the parent's existing
// `date_of_birth.length > 0` validation still gates the Continue button.

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseIsoDob(iso: string): { y: string; m: string; d: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return { y: "", m: "", d: "" };
  return { y: match[1], m: match[2], d: match[3] };
}

function combineIsoDob(y: string, m: string, d: string): string {
  if (!y || !m || !d) return "";
  // Validate the combination is a real calendar date (e.g. reject Feb 30)
  const yi = Number(y);
  const mi = Number(m);
  const di = Number(d);
  const test = new Date(Date.UTC(yi, mi - 1, di));
  if (
    test.getUTCFullYear() !== yi ||
    test.getUTCMonth() !== mi - 1 ||
    test.getUTCDate() !== di
  ) {
    return "";
  }
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function DobDropdowns({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  // Local state so partial selections (e.g. only Day chosen) stay visible
  // even though the parent only stores fully-valid ISO dates. Without this
  // local cache, an incomplete pick emits "" upward and the placeholder
  // re-appears on the next render, looking like the dropdown didn't work.
  const [parts, setParts] = useState(() => parseIsoDob(value));

  // Re-sync from the parent value when it is either fully empty or a
  // complete date — typically prefill on mount or restore after navigating
  // back to this step. We deliberately ignore parent updates while the
  // user is mid-entry (parent has "" but local has partial parts).
  useEffect(() => {
    const incoming = parseIsoDob(value);
    const parentComplete = !!(incoming.y && incoming.m && incoming.d);
    const parentEmpty = value === "";
    if (parentComplete || parentEmpty) {
      setParts((prev) => {
        if (
          prev.y === incoming.y &&
          prev.m === incoming.m &&
          prev.d === incoming.d
        ) {
          return prev;
        }
        // Don't clobber in-progress local edits with parent's "" (partial)
        if (parentEmpty && (prev.y || prev.m || prev.d)) return prev;
        return incoming;
      });
    }
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years: string[] = [];
  for (let y = currentYear; y >= 1924; y--) years.push(String(y));

  const update = (
    next: Partial<{ y: string; m: string; d: string }>
  ) => {
    const merged = { ...parts, ...next };
    setParts(merged);
    onChange(combineIsoDob(merged.y, merged.m, merged.d));
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        aria-label="Day"
        value={parts.d}
        onChange={(e) => update({ d: e.target.value })}
        className="mf-input cursor-pointer"
      >
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, i) => {
          const d = String(i + 1).padStart(2, "0");
          return (
            <option key={d} value={d}>
              {i + 1}
            </option>
          );
        })}
      </select>
      <select
        aria-label="Month"
        value={parts.m}
        onChange={(e) => update({ m: e.target.value })}
        className="mf-input cursor-pointer"
      >
        <option value="">Month</option>
        {MONTH_LABELS.map((label, i) => {
          const m = String(i + 1).padStart(2, "0");
          return (
            <option key={m} value={m}>
              {label}
            </option>
          );
        })}
      </select>
      <select
        aria-label="Year"
        value={parts.y}
        onChange={(e) => update({ y: e.target.value })}
        className="mf-input cursor-pointer"
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Representative (caregiver / POA) section ──────────────────────────

function RepresentativeSection({
  rep,
  onChange,
}: {
  rep: RepresentativeBlock;
  onChange: (next: RepresentativeBlock) => void;
}) {
  const labelStyle = { color: "#e8d5a3" };
  const reqMark = <span style={{ color: "#e05252" }}> *</span>;
  const update = <K extends keyof RepresentativeBlock>(
    key: K,
    value: RepresentativeBlock[K]
  ) => onChange({ ...rep, [key]: value });

  return (
    <section
      className="mb-6 pb-6 rounded-xl border p-5"
      style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
    >
      <h2
        className="font-heading text-xl sm:text-2xl font-semibold mb-1"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Your Information{" "}
        <span style={{ color: "#c4973a" }}>(Representative)</span>
      </h2>
      <p className="text-xs mb-4" style={{ color: "#e8d5a3" }}>
        We&apos;ll send order confirmations, appointment updates and results to
        you as the representative — not to the client&apos;s contact info.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            First Name{reqMark}
          </label>
          <input
            type="text"
            value={rep.first_name}
            onChange={(e) => update("first_name", e.target.value)}
            className="mf-input"
            autoComplete="given-name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            Last Name{reqMark}
          </label>
          <input
            type="text"
            value={rep.last_name}
            onChange={(e) => update("last_name", e.target.value)}
            className="mf-input"
            autoComplete="family-name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            Email{reqMark}
          </label>
          <input
            type="email"
            value={rep.email}
            onChange={(e) => update("email", e.target.value.trim())}
            className="mf-input"
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            Mobile Number{reqMark}
          </label>
          <input
            type="tel"
            value={rep.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="mf-input"
            autoComplete="tel"
            placeholder="+1 (403) 555-0000"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
          Your relationship to the client{reqMark}
        </label>
        <select
          value={rep.relationship}
          onChange={(e) =>
            update(
              "relationship",
              e.target.value as RepresentativeBlock["relationship"]
            )
          }
          className="mf-input cursor-pointer"
        >
          {REP_RELATIONSHIP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <label
        className="mt-4 flex items-start gap-2.5 cursor-pointer"
      >
        <input
          type="checkbox"
          checked={rep.poa_confirmed}
          onChange={(e) => update("poa_confirmed", e.target.checked)}
          className="mt-1 w-4 h-4 shrink-0"
          style={{ accentColor: "#c4973a" }}
        />
        <span className="text-sm leading-relaxed" style={{ color: "#ffffff" }}>
          I confirm that I have legal authority or written consent to authorize
          private medical laboratory testing on behalf of the individual(s)
          named in this order, and that all information provided is accurate.
        </span>
      </label>
    </section>
  );
}
