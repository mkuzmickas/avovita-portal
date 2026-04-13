import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/auth/complete-waiver
 *
 * Records the client's waiver signature on their accounts row and
 * inserts a general_pipa consent row. Called from the WaiverForm
 * component (used in both the post-purchase onboarding flow and the
 * standalone /portal/complete-waiver page).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const signedName: string | undefined = body.signed_name;

    if (!signedName || signedName.trim().length < 3) {
      return NextResponse.json(
        { error: "A signed name of at least 3 characters is required" },
        { status: 400 }
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;

    const nowIso = new Date().toISOString();

    // Update the accounts record with waiver info
    const { error: updateErr } = await supabase
      .from("accounts")
      .update({
        waiver_completed: true,
        waiver_completed_at: nowIso,
        waiver_ip_address: ipAddress,
        waiver_signed_name: signedName.trim(),
        waiver_version: "1.0",
      })
      .eq("id", user.id);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to save waiver: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // Insert a consent record (append-only PIPA compliance log).
    // The waiver itself is already saved on the account row; treat the
    // consent log insert as best-effort so a slow/failing log can't block
    // the user's response and leave them spinning forever.
    try {
      await supabase.from("consents").insert({
        account_id: user.id,
        profile_id: null,
        consent_type: "general_pipa",
        consent_text_version: "1.0",
        ip_address: ipAddress,
        user_agent: request.headers.get("user-agent") ?? null,
      });
    } catch (consentErr) {
      console.error(
        "[complete-waiver] consent log insert failed (non-fatal):",
        consentErr
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[complete-waiver] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
