import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/patients/[id]/profiles/[profileId]
 *
 * Admin-only. Overwrites a client's identity/contact fields when the
 * data was entered wrong (misspelled name, wrong DOB, typo in address,
 * outdated phone). Only reachable from the admin patient detail page.
 *
 * Editable fields: first_name, last_name, date_of_birth, biological_sex,
 * phone, address_line1, address_line2, city, province, postal_code.
 *
 * Immutable via this route: is_primary, is_minor, is_dependent,
 * relationship, mayo_patient_id, account_id, id. Those are structural
 * and changing them would break order lineage.
 */

const EDITABLE_KEYS = [
  "first_name",
  "last_name",
  "date_of_birth",
  "biological_sex",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "province",
  "postal_code",
] as const;
type EditableKey = (typeof EDITABLE_KEYS)[number];

const NON_NULL_KEYS = new Set<EditableKey>([
  "first_name",
  "last_name",
  "date_of_birth",
  "biological_sex",
]);

const SEX_VALUES = new Set(["male", "female", "intersex"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: accountRow } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();
    const account = accountRow as { role: string } | null;
    if (!account || account.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 },
      );
    }

    const { id: accountId, profileId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body must be an object" },
        { status: 400 },
      );
    }

    // Whitelist + normalize
    const raw = body as Record<string, unknown>;
    const update: Record<string, string | null> = {};
    for (const k of EDITABLE_KEYS) {
      if (!(k in raw)) continue;
      const v = raw[k];
      if (v === null || v === undefined) {
        if (NON_NULL_KEYS.has(k)) {
          return NextResponse.json(
            { error: `${k} cannot be null` },
            { status: 400 },
          );
        }
        update[k] = null;
        continue;
      }
      if (typeof v !== "string") {
        return NextResponse.json(
          { error: `${k} must be a string` },
          { status: 400 },
        );
      }
      const trimmed = v.trim();
      if (NON_NULL_KEYS.has(k) && trimmed.length === 0) {
        return NextResponse.json(
          { error: `${k} cannot be empty` },
          { status: 400 },
        );
      }
      update[k] = trimmed.length === 0 && !NON_NULL_KEYS.has(k) ? null : trimmed;
    }

    if (update.biological_sex && !SEX_VALUES.has(update.biological_sex)) {
      return NextResponse.json(
        { error: "biological_sex must be one of male|female|intersex" },
        { status: 400 },
      );
    }
    if (update.date_of_birth && !DATE_RE.test(update.date_of_birth)) {
      return NextResponse.json(
        { error: "date_of_birth must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No editable fields provided" },
        { status: 400 },
      );
    }

    const service = createServiceRoleClient();

    // Verify the profile belongs to the account in the URL — prevents a
    // crafted request from editing a profile on a different account.
    const { data: profRaw } = await service
      .from("patient_profiles")
      .select("id, account_id, first_name, last_name")
      .eq("id", profileId)
      .maybeSingle();
    const prof = profRaw as {
      id: string;
      account_id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
    if (!prof) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      );
    }
    if (prof.account_id !== accountId) {
      return NextResponse.json(
        { error: "Profile does not belong to this account" },
        { status: 403 },
      );
    }

    const before = {
      first_name: prof.first_name,
      last_name: prof.last_name,
    };

    const { error: updateErr } = await service
      .from("patient_profiles")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", profileId);
    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update profile: ${updateErr.message}` },
        { status: 500 },
      );
    }

    // Audit trail — analytics_events already carries admin-action rows.
    await service
      .from("analytics_events")
      .insert({
        event_type: "admin_patient_profile_edited",
        event_data: {
          profile_id: profileId,
          edited_by_admin_id: user.id,
          fields: Object.keys(update),
          name_before: `${before.first_name ?? ""} ${before.last_name ?? ""}`.trim(),
          name_after: `${update.first_name ?? before.first_name ?? ""} ${update.last_name ?? before.last_name ?? ""}`.trim(),
        },
        account_id: accountId,
      })
      .then(({ error }) => {
        if (error) {
          console.warn(
            "[admin:patients:profile:edit] analytics insert failed:",
            error.message,
          );
        }
      });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin:patients:profile:edit]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
