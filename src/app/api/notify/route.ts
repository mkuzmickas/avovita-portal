import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/resend";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateSignedResultUrl } from "@/lib/server-utils";
import {
  renderResultsReadyEmail,
} from "@/lib/emails/resultsReady";

export const runtime = "nodejs";

/**
 * POST /api/notify
 *
 * Sends email + SMS notifications for a result. Accepts:
 *   - result_id (required)
 *   - result_status: "partial" | "final" (optional, defaults to "final")
 *
 * When result_status is "partial" the email subject and SMS wording
 * reflect that additional results may follow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resultId: string | undefined = body.result_id;
    const resultStatus: "partial" | "final" =
      body.result_status === "partial" ? "partial" : "final";

    if (!resultId) {
      return NextResponse.json({ error: "Missing result_id" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch result
    const { data: resultRaw, error: resultError } = await supabase
      .from("results")
      .select("*")
      .eq("id", resultId)
      .single();

    if (resultError || !resultRaw) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }
    const result = resultRaw as {
      id: string;
      order_id: string;
      profile_id: string;
      storage_path: string;
    };

    // Fetch order tests for the email
    const { data: orderLinesRaw } = await supabase
      .from("order_lines")
      .select("test:tests(name, lab:labs(name))")
      .eq("order_id", result.order_id);

    type OlRow = { test: { name: string; lab: { name: string } | null } | null };
    const orderLines = (orderLinesRaw ?? []) as unknown as OlRow[];
    const tests = orderLines
      .map((ol) => ({
        name: ol.test?.name ?? "Lab test",
        lab: (Array.isArray(ol.test?.lab) ? ol.test?.lab[0] : ol.test?.lab)?.name ?? "",
      }))
      .filter((t) => t.name);

    // Fetch profile
    const { data: profileRaw } = await supabase
      .from("patient_profiles")
      .select("first_name, last_name, phone, account_id")
      .eq("id", result.profile_id)
      .single();
    const profile = profileRaw as {
      first_name: string;
      last_name: string;
      phone: string | null;
      account_id: string;
    } | null;

    // Fetch account
    const { data: accountRaw } = await supabase
      .from("accounts")
      .select("email")
      .eq("id", profile?.account_id ?? "")
      .single();
    const account = accountRaw as { email: string | null } | null;

    if (!profile || !account) {
      return NextResponse.json(
        { error: "Profile or account not found" },
        { status: 404 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
    const resultsUrl = `${appUrl}/portal/results`;
    const firstName = profile.first_name;

    // Pre-warm signed URL
    try {
      await generateSignedResultUrl(result.storage_path);
    } catch {
      // Non-fatal
    }

    const isPartial = resultStatus === "partial";

    const emailSubject = isPartial
      ? "Your AvoVita results are partially available"
      : "Your AvoVita results are ready";

    const emailBodyIntro = isPartial
      ? `Some of your lab results are now available in your portal. Additional results from your panel may follow as they are completed by the laboratory.`
      : `Your lab results are now available in your portal.`;

    const smsBody = isPartial
      ? `Hi ${firstName}, some of your AvoVita results are ready to view. More may follow: ${resultsUrl}`
      : `Hi ${firstName}, your AvoVita results are ready: ${resultsUrl}`;

    const errors: string[] = [];
    const orderId = result.order_id;

    // ─── Send email ──────────────────────────────────────────────────
    if (account.email) {
      try {
        const html = renderResultsReadyEmail({
          firstName,
          tests,
          portalUrl: appUrl,
          introOverride: emailBodyIntro,
        });

        await resend.emails.send({
          from: process.env.RESEND_FROM_RESULTS!,
          to: account.email,
          subject: emailSubject,
          html,
        });

        await supabase.from("notifications").insert({
          profile_id: result.profile_id,
          order_id: orderId,
          result_id: result.id,
          channel: "email",
          template: isPartial ? "results_partial" : "results_ready",
          recipient: account.email,
          status: "sent",
        });
      } catch (emailErr) {
        console.error("Email notification failed:", emailErr);
        errors.push("email");
        await supabase.from("notifications").insert({
          profile_id: result.profile_id,
          order_id: orderId,
          result_id: result.id,
          channel: "email",
          template: isPartial ? "results_partial" : "results_ready",
          recipient: account.email ?? "",
          status: "failed",
          error_message: String(emailErr),
        });
      }
    }

    // ─── Send SMS ────────────────────────────────────────────────────
    if (profile.phone && twilioClient) {
      try {
        await twilioClient.messages.create({
          from: TWILIO_FROM,
          to: profile.phone,
          body: smsBody,
        });

        await supabase.from("notifications").insert({
          profile_id: result.profile_id,
          order_id: orderId,
          result_id: result.id,
          channel: "sms",
          template: isPartial ? "results_partial" : "results_ready",
          recipient: profile.phone,
          status: "sent",
        });
      } catch (smsErr) {
        console.error("SMS notification failed:", smsErr);
        errors.push("sms");
        await supabase.from("notifications").insert({
          profile_id: result.profile_id,
          order_id: orderId,
          result_id: result.id,
          channel: "sms",
          template: isPartial ? "results_partial" : "results_ready",
          recipient: profile.phone,
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
