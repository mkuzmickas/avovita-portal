import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/resend";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateSignedResultUrl } from "@/lib/server-utils";
import {
  renderResultsReadyEmail,
  RESULTS_READY_SUBJECT,
} from "@/lib/emails/resultsReady";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { result_id } = await request.json();

    if (!result_id) {
      return NextResponse.json({ error: "Missing result_id" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch result with related data
    const { data: result, error: resultError } = await supabase
      .from("results")
      .select("*")
      .eq("id", result_id)
      .single();

    if (resultError || !result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    // Fetch order line with test
    const { data: orderLine } = await supabase
      .from("order_lines")
      .select("*, test:tests(name, lab:labs(name))")
      .eq("id", result.order_line_id)
      .single();

    // Fetch profile
    const { data: profile } = await supabase
      .from("patient_profiles")
      .select("*")
      .eq("id", result.profile_id)
      .single();

    // Fetch account
    const { data: account } = await supabase
      .from("accounts")
      .select("email")
      .eq("id", profile?.account_id ?? "")
      .single();

    if (!profile || !account) {
      return NextResponse.json({ error: "Profile or account not found" }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
    const resultsUrl = `${appUrl}/portal/results`;

    // Pre-warm the signed URL to verify storage access is healthy before
    // we notify the patient. If this fails we still send the email — the
    // patient will generate a fresh signed URL when they click View.
    try {
      await generateSignedResultUrl(result.storage_path);
    } catch {
      // Non-fatal — the portal page regenerates signed URLs on click.
    }

    const firstName = profile.first_name;
    const labName =
      ((orderLine?.test as { lab?: { name?: string } } | null)?.lab
        ?.name) ?? "";
    const testName =
      (orderLine?.test as { name?: string } | null)?.name ?? "your lab test";

    const errors: string[] = [];

    // ─── Send email ──────────────────────────────────────────────────────────
    if (account.email) {
      try {
        const html = renderResultsReadyEmail({
          firstName,
          tests: [{ name: testName, lab: labName }],
          portalUrl: appUrl,
        });

        await resend.emails.send({
          from: process.env.RESEND_FROM_RESULTS!,
          to: account.email,
          subject: RESULTS_READY_SUBJECT,
          html,
        });

        await supabase.from("notifications").insert({
          profile_id: result.profile_id,
          order_id: orderLine?.order_id ?? null,
          result_id: result.id,
          channel: "email",
          template: "results_ready",
          recipient: account.email,
          status: "sent",
        });
      } catch (emailErr) {
        console.error("Email notification failed:", emailErr);
        errors.push("email");
        await supabase.from("notifications").insert({
          profile_id: result.profile_id,
          order_id: orderLine?.order_id ?? null,
          result_id: result.id,
          channel: "email",
          template: "results_ready",
          recipient: account.email ?? "",
          status: "failed",
          error_message: String(emailErr),
        });
      }
    }

    // ─── Send SMS ────────────────────────────────────────────────────────────
    if (profile.phone) {
      try {
        await twilioClient.messages.create({
          from: TWILIO_FROM,
          to: profile.phone,
          body: `Hi ${firstName}, your AvoVita lab results are ready. Log in to view them securely: ${resultsUrl}`,
        });

        await supabase.from("notifications").insert({
          profile_id: result.profile_id,
          order_id: orderLine?.order_id ?? null,
          result_id: result.id,
          channel: "sms",
          template: "results_ready",
          recipient: profile.phone,
          status: "sent",
        });
      } catch (smsErr) {
        console.error("SMS notification failed:", smsErr);
        errors.push("sms");
        await supabase.from("notifications").insert({
          profile_id: result.profile_id,
          order_id: orderLine?.order_id ?? null,
          result_id: result.id,
          channel: "sms",
          template: "results_ready",
          recipient: profile.phone ?? "",
          status: "failed",
          error_message: String(smsErr),
        });
      }
    }

    // Update notified_at on result
    await supabase
      .from("results")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", result.id);

    return NextResponse.json({
      success: true,
      notified_via: {
        email: !!account.email && !errors.includes("email"),
        sms: !!profile.phone && !errors.includes("sms"),
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Notify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
