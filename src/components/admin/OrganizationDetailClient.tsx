"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  Upload,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import type { Organization } from "@/types/database";

export function OrganizationDetailClient({ org }: { org: Organization }) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [primary, setPrimary] = useState(org.primary_color);
  const [accent, setAccent] = useState(org.accent_color);
  const [contactEmail, setContactEmail] = useState(org.contact_email ?? "");
  const [active, setActive] = useState(org.active);
  const [logoUrl, setLogoUrl] = useState(org.logo_url);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const dirty =
    name !== org.name ||
    slug !== org.slug ||
    primary !== org.primary_color ||
    accent !== org.accent_color ||
    contactEmail !== (org.contact_email ?? "") ||
    active !== org.active;

  const save = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          primary_color: primary,
          accent_color: accent,
          contact_email: contactEmail || null,
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/organizations/${org.id}/logo`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
        return;
      }
      setLogoUrl(data.logo_url);
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          <span style={{ color: "#c4973a" }}>{org.name}</span>
        </h1>
        <p className="mt-1 text-xs font-mono" style={{ color: "#6ab04c" }}>
          /org/{slug}
        </p>
      </div>

      {/* Logo upload */}
      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h2
          className="font-heading text-lg font-semibold mb-1"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Logo
        </h2>
        <p className="text-xs mb-4" style={{ color: "#6ab04c" }}>
          PNG, JPEG, WebP, or SVG. Max 2 MB. Displays in the partner header.
        </p>
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div
            className="rounded-lg border p-4 flex items-center justify-center min-h-[100px] min-w-[180px]"
            style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${org.name} logo`}
                className="max-h-20 max-w-[200px] w-auto h-auto"
              />
            ) : (
              <p className="text-xs italic" style={{ color: "#6ab04c" }}>
                No logo yet
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                backgroundColor: "#c4973a",
                color: "#0a1a0d",
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
                e.target.value = "";
              }}
            />
            {uploadError && (
              <p className="text-xs" style={{ color: "#e05252" }}>
                {uploadError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Editable fields */}
      <section
        className="rounded-xl border p-5 space-y-3"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <h2
          className="font-heading text-lg font-semibold"
          style={{
            color: "#ffffff",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Branding & details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Display name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mf-input"
            />
          </Field>
          <Field
            label="URL slug"
            helper="Changes the URL — existing links break if you change this."
          >
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mf-input font-mono"
            />
          </Field>
          <Field label="Primary colour">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-10 w-12 rounded border cursor-pointer"
                style={{ borderColor: "#2d6b35" }}
              />
              <input
                type="text"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="mf-input flex-1 font-mono text-xs"
              />
            </div>
          </Field>
          <Field label="Accent colour">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-10 w-12 rounded border cursor-pointer"
                style={{ borderColor: "#2d6b35" }}
              />
              <input
                type="text"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="mf-input flex-1 font-mono text-xs"
              />
            </div>
          </Field>
        </div>
        <Field label="Contact email">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="mf-input"
          />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer mt-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            style={{ accentColor: "#c4973a" }}
            className="w-4 h-4"
          />
          <span className="text-sm" style={{ color: "#e8d5a3" }}>
            Active —{" "}
            <span className="text-xs" style={{ color: "#6ab04c" }}>
              uncheck to disable the public /org/{slug} routes (404)
            </span>
          </span>
        </label>

        {saveError && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg text-sm border"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.12)",
              borderColor: "#e05252",
              color: "#e05252",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {saveError}
          </div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{
            backgroundColor: "#c4973a",
            color: "#0a1a0d",
            opacity: saving || !dirty ? 0.5 : 1,
          }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </section>
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "#e8d5a3" }}>
        {label}
      </label>
      {children}
      {helper && (
        <p className="mt-1 text-xs" style={{ color: "#6ab04c" }}>
          {helper}
        </p>
      )}
    </div>
  );
}
