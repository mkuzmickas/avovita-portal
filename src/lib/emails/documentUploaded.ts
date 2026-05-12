/**
 * "New document in your portal" email — sent only when an admin ticks
 * the optional "Notify customer by email" checkbox while uploading a
 * manual PDF via the Results Repository.
 *
 * Deliberately separate from the order-tied results-ready template:
 *   • No test names or order references — this PDF is not tied to an
 *     order and the customer would find that confusing.
 *   • Single short message + portal CTA. The PDF itself is never
 *     embedded — patients always sign in to view.
 */

export interface DocumentUploadedEmailProps {
  firstName: string;
  portalUrl: string;
  /** Plural label, e.g. "1 new document" or "3 new documents". */
  countLabel: string;
}

export const DOCUMENT_UPLOADED_SUBJECT =
  "New document uploaded to your AvoVita portal";

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDocumentUploadedEmail(
  props: DocumentUploadedEmailProps
): string {
  const { firstName, portalUrl, countLabel } = props;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(DOCUMENT_UPLOADED_SUBJECT)}</title>
</head>
<body style="margin: 0; padding: 0; background: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: #0f2614; padding: 32px 32px 28px 32px; text-align: center; border-bottom: 3px solid #c4973a;">
              <h1 style="margin: 0; font-size: 28px; font-family: Georgia, 'Cormorant Garamond', serif; color: #ffffff; font-weight: 600;">
                AvoVita <span style="color: #c4973a;">Wellness</span>
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #8dc63f; letter-spacing: 0.5px;">
                NEW DOCUMENT IN YOUR PORTAL
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 36px 32px 12px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 24px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827; font-weight: 600;">
                Hi ${escapeHtml(firstName)},
              </h2>
              <p style="margin: 0 0 14px 0; font-size: 15px; color: #4b5563; line-height: 1.55;">
                ${escapeHtml(countLabel)} ${countLabel.endsWith("s") ? "have" : "has"} been added to your AvoVita client portal. Sign in to view or download.
              </p>
              <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280; line-height: 1.55;">
                This is not tied to a specific lab order — it's a document the AvoVita team uploaded to your record (for example, a previous report you shared with us, or a specialist letter).
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 32px 28px 32px; text-align: center;">
              <a href="${portalUrl}/portal/results" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px;">
                View in Portal
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 32px 28px 32px;">
              <div style="background: #f9fafb; border-left: 4px solid #0f2614; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #111827; font-weight: 600;">
                  🔒 Your records are private
                </p>
                <p style="margin: 0; font-size: 12px; color: #4b5563; line-height: 1.5;">
                  This email contains no health information. Documents are only accessible after you sign in to the client portal.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                AvoVita Wellness · Calgary, AB, Canada
              </p>
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                Questions? Contact <a href="mailto:support@avovita.ca" style="color: #0f2614;">support@avovita.ca</a>
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
