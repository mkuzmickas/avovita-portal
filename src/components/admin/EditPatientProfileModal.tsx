"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Save } from "lucide-react";
import type { AdminPatientProfile } from "@/app/(admin)/admin/patients/page";

interface EditPatientProfileModalProps {
  accountId: string;
  profile: AdminPatientProfile;
  onClose: () => void;
}

/**
 * Admin-only "fix a misspelling" editor. Wraps the PATCH route at
 * /api/admin/patients/[id]/profiles/[profileId]. Immutable fields
 * (is_primary, is_minor, is_dependent, relationship, mayo_patient_id)
 * are intentionally not surfaced — changing them would break order
 * lineage. If a structural change is ever needed, that's a separate
 * flow, not this modal.
 */
export function EditPatientProfileModal({
  accountId,
  profile,
  onClose,
}: EditPatientProfileModalProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    biological_sex: profile.biological_sex ?? "",
    phone: profile.phone ?? "",
    address_line1: profile.address_line1 ?? "",
    address_line2: profile.address_line2 ?? "",
    city: profile.city ?? "",
    province: profile.province ?? "AB",
    postal_code: profile.postal_code ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function onSave() {
    setError(null);
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First name and last name are required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth)) {
      setError("Date of birth must be a valid date.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/patients/${accountId}/profiles/${profile.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: form.first_name,
            last_name: form.last_name,
            date_of_birth: form.date_of_birth,
            biological_sex: form.biological_sex,
            phone: form.phone,
            address_line1: form.address_line1,
            address_line2: form.address_line2,
            city: form.city,
            province: form.province,
            postal_code: form.postal_code,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Save failed (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center justify-between p-5 border-b"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <h2
            className="font-heading text-xl font-semibold"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Edit <span style={{ color: "#c4973a" }}>profile</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg"
            style={{ color: "#e8d5a3" }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="First name" required>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Last name" required>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Date of birth" required>
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Biological sex" required>
              <select
                value={form.biological_sex}
                onChange={(e) => set("biological_sex", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              >
                <option value="">— choose —</option>
                <option value="male">male</option>
                <option value="female">female</option>
                <option value="intersex">intersex</option>
              </select>
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
            <div />
            <Field label="Address line 1" className="sm:col-span-2">
              <input
                type="text"
                value={form.address_line1}
                onChange={(e) => set("address_line1", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Address line 2" className="sm:col-span-2">
              <input
                type="text"
                value={form.address_line2}
                onChange={(e) => set("address_line2", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="City">
              <input
                type="text"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Province">
              <input
                type="text"
                value={form.province}
                onChange={(e) => set("province", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="Postal code">
              <input
                type="text"
                value={form.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </Field>
          </div>

          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: "rgba(220,90,90,0.15)",
                borderColor: "#dc5a5a",
                color: "#ffb0b0",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{
              backgroundColor: "#0f2614",
              borderColor: "#2d6b35",
              color: "#e8d5a3",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border"
            style={{
              backgroundColor: "#c4973a",
              borderColor: "#c4973a",
              color: "#0a1a0d",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={className}>
      <span
        className="block text-xs mb-1 uppercase tracking-wider"
        style={{ color: "#6ab04c" }}
      >
        {label}
        {required && <span style={{ color: "#c4973a" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1";
const INPUT_STYLE: React.CSSProperties = {
  backgroundColor: "#0f2614",
  borderColor: "#2d6b35",
  color: "#ffffff",
};
