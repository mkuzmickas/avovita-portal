"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Users,
  Package,
  CheckCircle,
} from "lucide-react";
import type { OrganizationWithCounts } from "@/app/(admin)/admin/organizations/page";

const PORTAL_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
  try {
    return new URL(url).host;
  } catch {
    return "portal.avovita.ca";
  }
})();
const PORTAL_BASE =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca").replace(
    /\/$/,
    ""
  );

export function OrganizationsManager({
  initialOrgs,
}: {
  initialOrgs: OrganizationWithCounts[];
}) {
  const router = useRouter();
  const [orgs, setOrgs] = useState(initialOrgs);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2d6b35");
  const [accentColor, setAccentColor] = useState("#c4973a");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync if the server re-fetches after router.refresh()
  useEffect(() => {
    setOrgs(initialOrgs);
  }, [initialOrgs]);

  const create = async () => {
    setError(null);
    if (!name.trim() || !slug.trim()) {
      setError("Name and slug are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          primary_color: primaryColor,
          accent_color: accentColor,
          contact_email: contactEmail.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create organization");
        return;
      }
      setName("");
      setSlug("");
      setContactEmail("");
      setPrimaryColor("#2d6b35");
      setAccentColor("#c4973a");
      setCreating(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: string, next: boolean) => {
    const res = await fetch(`/api/admin/organizations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Failed: ${data.error ?? res.statusText}`);
      return;
    }
    setOrgs((prev) =>
      prev.map((o) => (o.id === id ? { ...o, active: next } : o))
    );
  };

  const copyLink = async (org: OrganizationWithCounts) => {
    const url = `${PORTAL_BASE}/org/${org.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(org.id);
      setTimeout(() => setCopiedId((c) => (c === org.id ? null : c)), 1800);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          <Plus className="w-4 h-4" />
          {creating ? "Cancel" : "New Organization"}
        </button>
      </div>

      {creating && (
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
            New organization
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Display name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mf-input"
                placeholder="Always Best Care"
              />
            </Field>
            <Field
              label="URL slug"
              required
              helper="Letters, numbers, hyphens, underscores. Becomes part of the URL."
            >
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="mf-input"
                placeholder="AlwaysBestCare"
              />
            </Field>
            <Field label="Primary colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-12 rounded border cursor-pointer"
                  style={{ borderColor: "#2d6b35" }}
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="mf-input flex-1 font-mono text-xs"
                />
              </div>
            </Field>
            <Field label="Accent colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-12 rounded border cursor-pointer"
                  style={{ borderColor: "#2d6b35" }}
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
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
              placeholder="info@partner.com"
            />
          </Field>

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
            type="button"
            onClick={create}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{
              backgroundColor: "#c4973a",
              color: "#0a1a0d",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {submitting ? "Creating…" : "Create organization"}
          </button>
        </section>
      )}

      {orgs.length === 0 ? (
        <div
          className="rounded-xl border px-6 py-12 text-center"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#2d6b35" }} />
          <p style={{ color: "#6ab04c" }}>
            No organizations yet. Create one above to start onboarding a partner.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {orgs.map((org) => (
            <div
              key={org.id}
              className="rounded-xl border p-5 flex flex-col gap-3"
              style={{
                backgroundColor: "#1a3d22",
                borderColor: org.active ? org.primary_color : "#2d6b35",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {org.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={org.logo_url}
                      alt={`${org.name} logo`}
                      className="h-10 w-auto rounded shrink-0"
                      style={{ maxWidth: "120px", objectFit: "contain" }}
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold shrink-0"
                      style={{
                        backgroundColor: org.primary_color,
                        color: "#ffffff",
                      }}
                    >
                      {org.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p
                      className="font-heading text-lg font-semibold leading-tight truncate"
                      style={{
                        color: "#ffffff",
                        fontFamily: '"Cormorant Garamond", Georgia, serif',
                      }}
                    >
                      {org.name}
                    </p>
                    <p className="text-xs font-mono" style={{ color: "#6ab04c" }}>
                      {PORTAL_HOST}/org/{org.slug}
                    </p>
                  </div>
                </div>
                <ActiveToggle
                  on={org.active}
                  onClick={() => toggleActive(org.id, !org.active)}
                />
              </div>

              <div className="flex items-center gap-4 text-xs" style={{ color: "#e8d5a3" }}>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" style={{ color: "#c4973a" }} />
                  {org.client_count} client{org.client_count === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" style={{ color: "#c4973a" }} />
                  {org.order_count} order{org.order_count === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => copyLink(org)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: "#c4973a",
                    color: "#c4973a",
                  }}
                >
                  {copiedId === org.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy portal link
                    </>
                  )}
                </button>
                <a
                  href={`/org/${org.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: "#2d6b35",
                    color: "#e8d5a3",
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Preview
                </a>
                <Link
                  href={`/admin/organizations/${org.id}`}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                >
                  Edit & upload logo
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 shrink-0"
      role="switch"
      aria-checked={on}
    >
      <span
        className="relative inline-block w-9 h-5 rounded-full transition-colors"
        style={{ backgroundColor: on ? "#8dc63f" : "#2d6b35" }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
          style={{
            backgroundColor: on ? "#0a1a0d" : "#e8d5a3",
            transform: on ? "translateX(18px)" : "translateX(2px)",
          }}
        />
      </span>
      <span
        className="text-xs"
        style={{ color: on ? "#8dc63f" : "#6ab04c" }}
      >
        {on ? (
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Active
          </span>
        ) : (
          "Inactive"
        )}
      </span>
    </button>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "#e8d5a3" }}>
        {label}
        {required && <span style={{ color: "#e05252" }}> *</span>}
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
