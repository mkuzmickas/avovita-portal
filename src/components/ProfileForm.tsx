"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ConsentModal } from "@/components/ConsentModal";
import type { PatientProfile } from "@/types/database";

interface ProfileFormProps {
  accountId: string;
  isPrimary?: boolean;
  redirectAfter?: string;
  existingProfile?: PatientProfile;
  onSaved?: () => void;
}

export function ProfileForm({
  accountId,
  isPrimary = false,
  redirectAfter,
  existingProfile,
  onSaved,
}: ProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);

  const [form, setForm] = useState({
    first_name: existingProfile?.first_name ?? "",
    last_name: existingProfile?.last_name ?? "",
    date_of_birth: existingProfile?.date_of_birth ?? "",
    biological_sex: existingProfile?.biological_sex ?? ("" as string),
    phone: existingProfile?.phone ?? "",
    address_line1: existingProfile?.address_line1 ?? "",
    address_line2: existingProfile?.address_line2 ?? "",
    city: existingProfile?.city ?? "",
    province: existingProfile?.province ?? "AB",
    postal_code: existingProfile?.postal_code ?? "",
    is_minor: existingProfile?.is_minor ?? false,
  });

  const handleChange = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!existingProfile && isPrimary) {
      setShowConsentModal(true);
      return;
    }

    await saveProfile();
  };

  const saveProfile = async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const payload = {
      account_id: accountId,
      first_name: form.first_name,
      last_name: form.last_name,
      date_of_birth: form.date_of_birth,
      biological_sex: form.biological_sex as "male" | "female" | "intersex",
      phone: form.phone || null,
      address_line1: form.address_line1 || null,
      address_line2: form.address_line2 || null,
      city: form.city || null,
      province: form.province,
      postal_code: form.postal_code || null,
      is_minor: form.is_minor,
      is_primary: isPrimary,
    };

    let saveError;
    if (existingProfile) {
      const { error } = await supabase
        .from("patient_profiles")
        .update(payload)
        .eq("id", existingProfile.id);
      saveError = error;
    } else {
      const { error } = await supabase.from("patient_profiles").insert(payload);
      saveError = error;
    }

    if (saveError) {
      setError(saveError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    onSaved?.();
    if (redirectAfter) {
      router.push(redirectAfter);
      router.refresh();
    }
  };

  const labelStyle = { color: "#e8d5a3" };

  return (
    <>
      {showConsentModal && (
        <ConsentModal
          consentTypes={["general_pipa"]}
          labName="AvoVita Wellness"
          onConsented={() => {
            setShowConsentModal(false);
            saveProfile();
          }}
          onDismissed={() => setShowConsentModal(false)}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={labelStyle}
            >
              First Name <span style={{ color: "#e05252" }}>*</span>
            </label>
            <input
              type="text"
              required
              value={form.first_name}
              onChange={(e) => handleChange("first_name", e.target.value)}
              className="mf-input"
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={labelStyle}
            >
              Last Name <span style={{ color: "#e05252" }}>*</span>
            </label>
            <input
              type="text"
              required
              value={form.last_name}
              onChange={(e) => handleChange("last_name", e.target.value)}
              className="mf-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={labelStyle}
            >
              Date of Birth <span style={{ color: "#e05252" }}>*</span>
            </label>
            <input
              type="date"
              required
              value={form.date_of_birth}
              onChange={(e) => handleChange("date_of_birth", e.target.value)}
              className="mf-input"
              style={{ colorScheme: "dark" }}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={labelStyle}
            >
              Biological Sex <span style={{ color: "#e05252" }}>*</span>
            </label>
            <select
              required
              value={form.biological_sex}
              onChange={(e) => handleChange("biological_sex", e.target.value)}
              className="mf-input"
            >
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="intersex">Intersex</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
            Phone Number
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            className="mf-input"
            placeholder="+1 (403) 555-0100"
          />
          <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
            Used for SMS result notifications
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
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
              City
            </label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => handleChange("city", e.target.value)}
              className="mf-input"
              placeholder="Calgary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={labelStyle}>
              Province
            </label>
            <select
              value={form.province}
              onChange={(e) => handleChange("province", e.target.value)}
              className="mf-input"
            >
              <option value="AB">AB</option>
              <option value="BC">BC</option>
              <option value="SK">SK</option>
              <option value="MB">MB</option>
              <option value="ON">ON</option>
              <option value="QC">QC</option>
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
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_minor"
            checked={form.is_minor}
            onChange={(e) => handleChange("is_minor", e.target.checked)}
            className="w-4 h-4 rounded"
            style={{ accentColor: "#c4973a" }}
          />
          <label htmlFor="is_minor" className="text-sm" style={{ color: "#e8d5a3" }}>
            This patient is a minor (under 18)
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
          {existingProfile ? "Save Changes" : "Create Profile"}
        </button>
      </form>
    </>
  );
}
