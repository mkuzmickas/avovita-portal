import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/resend";
import { twilioClient, TWILIO_FROM } from "@/lib/twilio";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateSignedResultUrl } from "@/lib/server-utils";

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.avovita.ca";
    const resultsUrl = `${appUrl}/portal/results`;

    // Generate signed URL (for email reference — not embedded, patient logs in to view)
    let signedUrl: string;
    try {
      signedUrl = await generateSignedResultUrl(result.storage_path);
    } catch {
      signedUrl = resultsUrl;
    }

    const firstName = profile.first_name;
    const testName =
      (orderLine?.test as { name?: string } | null)?.name ?? "your lab test";

    const errors: string[] = [];

    // ─── Send email ──────────────────────────────────────────────────────────
    if (account.email) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_RESULTS!,
          to: account.email,
          subject: "Your AvoVita results are ready",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a1a0d; color: #e8d5a3;">
              <div style="background: #0f2614; padding: 32px; text-align: center; border-bottom: 1px solid #2d6b35;">
                <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-family: Georgia, serif;">AvoVita <span style="color: #c4973a;">Wellness</span></h1>
                <p style="color: #8dc63f; margin: 8px 0 0 0; font-size: 14px;">Private Lab Testing, Calgary</p>
              </div>
              <div style="padding: 32px; background: #0a1a0d;">
                <h2 style="color: #ffffff; font-family: Georgia, serif; margin-top: 0;">Hi ${firstName},</h2>
                <p style="color: #e8d5a3;">Your lab results for <strong style="color: #ffffff;">${testName}</strong> are now available in your patient portal.</p>
                <p style="color: #e8d5a3;">Log in securely to view and download your results:</p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${resultsUrl}" style="background: #c4973a; color: #0a1a0d; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; display: inline-block;">
                    View My Results
                  </a>
                </div>
                <p style="color: #6ab04c; font-size: 13px;">
                  For your privacy, results are only available through your secure patient portal.
                  This signed link expires in 1 hour. Always access your results through
                  <a href="${resultsUrl}" style="color: #c4973a;">${resultsUrl}</a>.
                </p>
                <p style="color: #6ab04c; font-size: 13px;">
                  If you did not request these results or have any questions, please contact
                  AvoVita Wellness at <a href="mailto:hello@avovita.ca" style="color: #c4973a;">hello@avovita.ca</a>.
                  This communication is governed by Alberta PIPA.
                </p>
              </div>
            </div>
          `,
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
