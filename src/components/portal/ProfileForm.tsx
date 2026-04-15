"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PatientProfile } from "@/types/database";

/**
 * Canadian provinces + territories — alphabetical by abbreviation for
 * quick admin entry.
 */
const CA_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

/**
 * Lightweight prefill shape — a subset of PatientProfile fields used to
 * pre-populate the form from checkout metadata without requiring a full
 * Supabase row to exist yet.
 */
export interface ProfilePrefillData {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  biological_sex?: "male" | "female" | "intersex";
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string;
  postal_code?: string | null;
}

export interface ProfileFormProps {
  accountId: string;
  /** Mark this profile as the primary (first) profile on the account. */
  isPrimary?: boolean;
  /** Optional redirect URL on successful save. */
  redirectAfter?: string;
  /** Pass an existing profile to switch the form to edit mode. */
  existingProfile?: PatientProfile;
  /**
   * Pre-fill form fields from checkout metadata. Lower priority than
   * existingProfile — if both are provided existingProfile wins.
   */
  prefillData?: ProfilePrefillData;
  /** Override the submit button text (e.g. "Confirm and Continue"). */
  submitLabel?: string;
  /**
   * Called after Supabase insert/update succeeds. Receives the saved
   * profile id so the caller can chain into a consent flow.
   */
  onSuccess?: (profileId: string) => void;
}

export function ProfileForm({
  accountId,
  isPrimary = false,
  redirectAfter,
  existingProfile,
  prefillData,
  submitLabel,
  onSuccess,
}: ProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // existingProfile takes priority, then prefillData, then empty defaults.
  const src = existingProfile ?? prefillData;

  const [form, setForm] = useState({
    first_name: src?.first_name ?? "",
    last_name: src?.last_name ?? "",
    date_of_birth: src?.date_of_birth ?? "",
    biological_sex:
      (existingProfile?.biological_sex ?? prefillData?.biological_sex ?? "") as string,
    phone: src?.phone ?? "",
    address_line1: src?.address_line1 ?? "",
    address_line2: src?.address_line2 ?? "",
    city: src?.city ?? "",
    province: src?.province ?? "AB",
    postal_code: src?.postal_code ?? "",
    is_minor: existingProfile?.is_minor ?? false,
  });

  const handleChange = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.phone.trim()) {
      setError("Mobile number is required for SMS notifications");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    const payload = {
      account_id: accountId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      date_of_birth: form.date_of_birth,
      biological_sex: form.biological_sex as "male" | "female" | "intersex",
      phone: form.phone.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      province: form.province,
      postal_code: form.postal_code.trim() || null,
      is_minor: form.is_minor,
      is_primary: isPrimary,
    };

    let savedProfileId: string | null = null;
    let saveError;

    if (existingProfile) {
      const { data, error: err } = await supabase
        .from("patient_profiles")
        .update(payload)
        .eq("id", existingProfile.id)
        .select("id")
        .single();
      savedProfileId = (data as { id: string } | null)?.id ?? null;
      saveError = err;
    } else {
      const { data, error: err } = await supabase
        .from("patient_profiles")
        .insert(payload)
        .select("id")
        .single();
      savedProfileId = (data as { id: string } | null)?.id ?? null;
      saveError = err;
    }

    if (saveError || !savedProfileId) {
      setError(saveError?.message ?? "Failed to save profile");
      setLoading(false);
      return;
    }

    setLoading(false);
    onSuccess?.(savedProfileId);

    if (redirectAfter) {
      router.push(redirectAfter);
      router.refresh();
    }
  };

  const labelStyle = { color: "#e8d5a3" };
  const reqMark = <span style={{ color: "#e05252" }}> *</span>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            First Name{reqMark}
          </label>
          <input
            type="text"
            required
            value={form.first_name}
            onChange={(e) => handleChange("first_name", e.target.value)}
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
            required
            value={form.last_name}
            onChange={(e) => handleChange("last_name", e.target.value)}
            className="mf-input"
            autoComplete="family-name"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            Date of Birth{reqMark}
          </label>
          <input
            type="date"
            required
            value={form.date_of_birth}
            onChange={(e) => handleChange("date_of_birth", e.target.value)}
            className="mf-input"
            style={{ colorScheme: "dark" }}
            autoComplete="bday"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            Biological Sex{reqMark}
          </label>
          <select
            required
            value={form.biological_sex}
            onChange={(e) => handleChange("biological_sex", e.target.value)}
            className="mf-input cursor-pointer"
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
          Mobile Number{reqMark}
        </label>
        <input
          type="tel"
          required
          value={form.phone}
          onChange={(e) => handleChange("phone", e.target.value)}
          className="mf-input"
          placeholder="+1 (403) 555-0000"
          autoComplete="tel"
        />
        <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
          Required for SMS notifications when your order ships and results are ready
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
          Address Line 1
        </label>
        <input
          type="text"
          value={form.address_line1}
          onChange={(e) => handleChange("address_line1", e.target.value)}
          className="mf-input"
          placeholder="123 Main St"
          autoComplete="address-line1"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
          Address Line 2
        </label>
        <input
          type="text"
          value={form.address_line2}
          onChange={(e) => handleChange("address_line2", e.target.value)}
          className="mf-input"
          placeholder="Suite, Unit, Apt #"
          autoComplete="address-line2"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            City
          </label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => handleChange("city", e.target.value)}
            className="mf-input"
            placeholder="Calgary"
            autoComplete="address-level2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            Province
          </label>
          <select
            value={form.province}
            onChange={(e) => handleChange("province", e.target.value)}
            className="mf-input cursor-pointer"
          >
            {CA_PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            Postal Code
          </label>
          <input
            type="text"
            value={form.postal_code}
            onChange={(e) =>
              handleChange("postal_code", e.target.value.toUpperCase())
            }
            className="mf-input"
            placeholder="T2P 1A1"
            maxLength={7}
            autoComplete="postal-code"
          />
        </div>
      </div>

      <div
        className="flex items-start gap-2 rounded-lg border p-3"
        style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
      >
        <input
          type="checkbox"
          id="is_minor"
          checked={form.is_minor}
          onChange={(e) => handleChange("is_minor", e.target.checked)}
          className="w-4 h-4 rounded mt-0.5 shrink-0"
          style={{ accentColor: "#c4973a" }}
        />
        <label htmlFor="is_minor" className="flex-1 cursor-pointer">
          <span
            className="block text-sm font-medium"
            style={{ color: "#e8d5a3" }}
          >
            This patient is a minor (under 18)
          </span>
          <span className="block text-xs mt-1" style={{ color: "#6ab04c" }}>
            Minor profiles will be linked to your account. You remain the
            legal guardian responsible for consent and result access.
          </span>
        </label>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-sm border"
          style={{
            backgroundColor: "rgba(224, 82, 82, 0.12)",
            borderColor: "#e05252",
            color: "#e05252",
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mf-btn-primary w-full py-2.5"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitLabel ?? (existingProfile ? "Save Changes" : "Create Profile")}
      </button>
    </form>
  );
}
