/**
 * Results-ready email template. Same design language as the order
 * confirmation: dark-green header band with gold accent, white body for
 * email-client compatibility, gold CTA that takes the patient to the
 * portal where they sign in to view the signed PDF. We never embed the
 * signed URL directly in the email — always force the patient through
 * authentication first.
 */

export interface ResultsReadyTest {
  name: string;
  lab: string;
}

export interface ResultsReadyProps {
  firstName: string;
  tests: ResultsReadyTest[];
  portalUrl: string;
  /** Override the intro paragraph (used for partial vs final messaging). */
  introOverride?: string;
}

export const RESULTS_READY_SUBJECT = "Your AvoVita results are ready";

export function renderResultsReadyEmail(props: ResultsReadyProps): string {
  const { firstName, tests, portalUrl, introOverride } = props;
  const introText = introOverride ?? "Sign in to your patient portal to view and download your lab results securely.";

  const testList = tests
    .map(
      (t) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: 600; font-size: 14px; color: #111827;">${escapeHtml(t.name)}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(t.lab)}</div>
          </td>
        </tr>
      `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your AvoVita results are ready</title>
</head>
<body style="margin: 0; padding: 0; background: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background: #0f2614; padding: 32px 32px 28px 32px; text-align: center; border-bottom: 3px solid #c4973a;">
              <h1 style="margin: 0; font-size: 28px; font-family: Georgia, 'Cormorant Garamond', serif; color: #ffffff; font-weight: 600;">
                AvoVita <span style="color: #c4973a;">Wellness</span>
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #8dc63f; letter-spacing: 0.5px;">
                PRIVATE LAB TESTING · CALGARY
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px 16px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 24px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827; font-weight: 600;">
                Your results are ready, ${escapeHtml(firstName)}
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; color: #4b5563; line-height: 1.5;">
                ${escapeHtml(introText)}
              </p>
            </td>
          </tr>

          <!-- Tests -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">
                Results available for
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 2px solid #0f2614;">
                ${testList}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 32px; text-align: center;">
              <a href="${portalUrl}/portal/results" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 16px 36px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 16px;">
                View My Results
              </a>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding: 0 32px 28px 32px;">
              <div style="background: #f9fafb; border-left: 4px solid #0f2614; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #111827; font-weight: 600;">
                  🔒 Your results are private and secure
                </p>
                <p style="margin: 0; font-size: 12px; color: #4b5563; line-height: 1.5;">
                  For your privacy, results are only accessible through your authenticated patient portal.
                  This email does not contain any health information. Links to your results expire after 1 hour
                  and require re-authentication if accessed again.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                AvoVita Wellness · 2490409 Alberta Ltd. · Calgary, AB, Canada
              </p>
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                Questions about your results? Contact <a href="mailto:hello@avovita.ca" style="color: #0f2614;">hello@avovita.ca</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                Your health information is protected under Alberta PIPA.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
