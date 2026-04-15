"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type {
  AdminPromoCode,
  OrgOption,
} from "@/app/(admin)/admin/promo-codes/page";

interface Props {
  codes: AdminPromoCode[];
  orgs: OrgOption[];
}

interface FormState {
  id?: string;
  code: string;
  description: string;
  percent_off: string;
  amount_off: string;
  org_id: string;
  max_redemptions: string;
  expires_at: string;
  stripe_promo_id: string;
  stripe_coupon_id: string;
  active: boolean;
}

const BLANK: FormState = {
  code: "",
  description: "",
  percent_off: "",
  amount_off: "",
  org_id: "",
  max_redemptions: "",
  expires_at: "",
  stripe_promo_id: "",
  stripe_coupon_id: "",
  active: true,
};

export function PromoCodesManager({ codes, orgs }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const resetForm = () => {
    setForm(BLANK);
    setError(null);
    setShowForm(false);
  };

  const loadForEdit = (c: AdminPromoCode) => {
    setForm({
      id: c.id,
      code: c.code,
      description: c.description ?? "",
      percent_off: c.percent_off != null ? String(c.percent_off) : "",
      amount_off: c.amount_off != null ? String(c.amount_off) : "",
      org_id: c.org_id ?? "",
      max_redemptions:
        c.max_redemptions != null ? String(c.max_redemptions) : "",
      expires_at: c.expires_at ? c.expires_at.slice(0, 10) : "",
      stripe_promo_id: c.stripe_promo_id ?? "",
      stripe_coupon_id: c.stripe_coupon_id ?? "",
      active: c.active,
    });
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) {
      setError("Code is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim(),
        description: form.description.trim() || null,
        percent_off: form.percent_off ? Number(form.percent_off) : 0,
        amount_off: form.amount_off ? Number(form.amount_off) : 0,
        org_id: form.org_id || null,
        max_redemptions: form.max_redemptions
          ? Number(form.max_redemptions)
          : null,
        expires_at: form.expires_at
          ? new Date(form.expires_at + "T23:59:59").toISOString()
          : null,
        stripe_promo_id: form.stripe_promo_id.trim() || null,
        stripe_coupon_id: form.stripe_coupon_id.trim() || null,
        active: form.active,
      };
      const url = form.id
        ? `/api/admin/promo-codes/${form.id}`
        : "/api/admin/promo-codes";
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Save failed");
      }
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (c: AdminPromoCode) => {
    const res = await fetch(`/api/admin/promo-codes/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    if (res.ok) router.refresh();
  };

  const remove = async (c: AdminPromoCode) => {
    if (!confirm(`Delete promo code "${c.code}"? This cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/admin/promo-codes/${c.id}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
  };

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => {
            setForm(BLANK);
            setShowForm(true);
          }}
          className="mf-btn-primary px-4 py-2"
        >
          <Plus className="w-4 h-4" />
          New Promo Code
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border p-5 mb-6"
          style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
        >
          <h2
            className="font-heading text-xl font-semibold mb-4"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            {form.id ? "Edit" : "New"}{" "}
            <span style={{ color: "#c4973a" }}>Promo Code</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Code *">
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="mf-input"
                placeholder="e.g. summer-2026"
                required
              />
            </Field>
            <Field label="Description">
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="mf-input"
                placeholder="Internal label"
              />
            </Field>
            <Field label="Percent Off (0–100)">
              <input
                type="number"
                min={0}
                max={100}
                value={form.percent_off}
                onChange={(e) =>
                  setForm({ ...form, percent_off: e.target.value })
                }
                className="mf-input"
              />
            </Field>
            <Field label="Amount Off (CAD)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount_off}
                onChange={(e) =>
                  setForm({ ...form, amount_off: e.target.value })
                }
                className="mf-input"
              />
            </Field>
            <Field label="Organization (optional)">
              <select
                value={form.org_id}
                onChange={(e) =>
                  setForm({ ...form, org_id: e.target.value })
                }
                className="mf-input cursor-pointer"
              >
                <option value="">— Any store —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Max Redemptions">
              <input
                type="number"
                min={1}
                value={form.max_redemptions}
                onChange={(e) =>
                  setForm({ ...form, max_redemptions: e.target.value })
                }
                className="mf-input"
                placeholder="Unlimited"
              />
            </Field>
            <Field label="Expires At">
              <input
                type="date"
                value={form.expires_at}
                onChange={(e) =>
                  setForm({ ...form, expires_at: e.target.value })
                }
                className="mf-input"
                style={{ colorScheme: "dark" }}
              />
            </Field>
            <Field label="Stripe Promo ID (promo_xxx)">
              <input
                type="text"
                value={form.stripe_promo_id}
                onChange={(e) =>
                  setForm({ ...form, stripe_promo_id: e.target.value })
                }
                className="mf-input"
                placeholder="promo_..."
              />
            </Field>
            <Field label="Stripe Coupon ID">
              <input
                type="text"
                value={form.stripe_coupon_id}
                onChange={(e) =>
                  setForm({ ...form, stripe_coupon_id: e.target.value })
                }
                className="mf-input"
              />
            </Field>
            <div className="flex items-center gap-2 mt-6">
              <input
                id="promo-active"
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.checked })
                }
                style={{ accentColor: "#c4973a" }}
                className="w-4 h-4"
              />
              <label
                htmlFor="promo-active"
                className="text-sm"
                style={{ color: "#e8d5a3" }}
              >
                Active
              </label>
            </div>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm border mt-4"
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

          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={resetForm}
              className="mf-btn-secondary px-5 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="mf-btn-primary px-5 py-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Saving…" : form.id ? "Update" : "Create"}
            </button>
          </div>
        </form>
      )}

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f2614" }}>
                {[
                  "Code",
                  "Description",
                  "Discount",
                  "Org",
                  "Redemptions",
                  "Expires",
                  "Stripe Promo ID",
                  "Active",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
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
              {codes.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-16 text-center"
                    style={{ backgroundColor: "#0a1a0d", color: "#6ab04c" }}
                  >
                    No promo codes yet
                  </td>
                </tr>
              ) : (
                codes.map((c, idx) => {
                  const rowBg = idx % 2 === 0 ? "#0a1a0d" : "#1a3d22";
                  const discountLabel =
                    c.percent_off && c.percent_off > 0
                      ? `${c.percent_off}% off`
                      : c.amount_off && Number(c.amount_off) > 0
                        ? `$${Number(c.amount_off).toFixed(2)} off`
                        : "—";
                  return (
                    <tr
                      key={c.id}
                      style={{
                        backgroundColor: rowBg,
                        borderTop: "1px solid #1a3d22",
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono font-semibold"
                            style={{ color: "#ffffff" }}
                          >
                            {c.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => copy(c.code)}
                            className="p-1 rounded"
                            style={{ color: "#c4973a" }}
                            title="Copy code"
                          >
                            {copied === c.code ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 max-w-[220px] truncate"
                        style={{ color: "#e8d5a3" }}
                        title={c.description ?? ""}
                      >
                        {c.description ?? "—"}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "#c4973a", fontWeight: 600 }}
                      >
                        {discountLabel}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {c.org_name ?? "Any"}
                      </td>
                      <td className="px-4 py-3" style={{ color: "#e8d5a3" }}>
                        {c.times_redeemed}
                        {c.max_redemptions != null && ` / ${c.max_redemptions}`}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "#e8d5a3" }}
                      >
                        {c.expires_at
                          ? new Date(c.expires_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: "#6ab04c" }}
                      >
                        {c.stripe_promo_id ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(c)}
                          className="px-2 py-1 rounded-full text-xs font-semibold border"
                          style={{
                            backgroundColor: c.active
                              ? "rgba(141,198,63,0.15)"
                              : "transparent",
                            borderColor: c.active ? "#8dc63f" : "#6ab04c",
                            color: c.active ? "#8dc63f" : "#6ab04c",
                          }}
                        >
                          {c.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => loadForEdit(c)}
                          className="p-1.5 rounded"
                          style={{ color: "#c4973a" }}
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          className="p-1.5 rounded"
                          style={{ color: "#e05252" }}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "#e8d5a3" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

