/**
 * Reminder email sent every 24h to users who have an unconfirmed account.
 * Branded to match the order confirmation styling.
 */

export interface ConfirmReminderProps {
  firstName: string;
  confirmationLink: string;
  /** Day count since account creation, used to soften copy on day 1 vs 6. */
  daySinceSignup: number;
  /** Public portal hostname, e.g. portal.avovita.ca. */
  portalHost: string;
}

export function confirmReminderSubject(daySinceSignup: number): string {
  if (daySinceSignup <= 1) {
    return "Confirm your email to access your AvoVita portal";
  }
  return `Reminder — confirm your email to view your AvoVita results`;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderConfirmReminderEmail(props: ConfirmReminderProps): string {
  const { firstName, confirmationLink, daySinceSignup, portalHost } = props;
  const friendlyName = firstName.trim() || "there";
  const intro =
    daySinceSignup <= 1
      ? "We noticed you haven't confirmed your email yet — one quick click and you're in."
      : `It's been ${daySinceSignup} days since you ordered with us and your account still needs confirming. Your results can't be delivered to the portal until then.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Confirm your AvoVita email</title>
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
                EMAIL CONFIRMATION REMINDER
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 16px 32px;">
              <h2 style="margin: 0 0 8px 0; font-size: 24px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827; font-weight: 600;">
                Hi ${escapeHtml(friendlyName)},
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; color: #4b5563; line-height: 1.5;">
                ${escapeHtml(intro)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px;">
              <div style="border: 2px solid #c4973a; border-radius: 10px; padding: 20px; background: #fffbeb;">
                <p style="margin: 0 0 14px 0; font-size: 14px; color: #4b5563; line-height: 1.5;">
                  Confirm your email to activate your account at <strong style="color: #111827;">${escapeHtml(portalHost)}</strong>.
                </p>
                <a href="${confirmationLink}" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px;">
                  Confirm Email & Access Portal
                </a>
                <p style="margin: 12px 0 0 0; font-size: 11px; color: #6b7280;">
                  This link expires in 24 hours. We'll send another reminder tomorrow if needed.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 32px 32px; text-align: center;">
              <p style="margin: 16px 0 0 0; font-size: 12px; color: #6b7280;">
                Didn't order with us? You can safely ignore this email and the account will be removed automatically.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                AvoVita Wellness · Calgary, AB, Canada
              </p>
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                Questions? <a href="mailto:support@avovita.ca" style="color: #0f2614;">support@avovita.ca</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                Protected under Alberta PIPA.
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
