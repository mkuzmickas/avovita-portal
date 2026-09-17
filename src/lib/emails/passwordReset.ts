/**
 * Admin-triggered password reset email. Fired by the "Send password
 * reset" button on /admin/patients/[id]. The reset link is generated
 * via supabase.auth.admin.generateLink({ type: 'recovery' }) so it
 * bypasses the anon-side rate limits Pam Morrell hit when the client
 * called resetPasswordForEmail from the /forgot-password page.
 *
 * Visual style mirrors the existing branded emails (dark green header,
 * gold accent, white body, mailto footer).
 */

export interface PasswordResetEmailProps {
  firstName: string;
  /** Full Supabase recovery URL — clicking lands the user on
   *  /auth/update-password with the recovery token pre-consumed. */
  resetUrl: string;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function passwordResetSubject(): string {
  return "Reset your AvoVita client portal password";
}

export function renderPasswordResetEmail(
  props: PasswordResetEmailProps,
): string {
  const { firstName, resetUrl } = props;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset your AvoVita password</title>
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
            <td style="padding: 36px 32px 8px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 24px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827; font-weight: 600;">
                Hi ${escapeHtml(firstName)},
              </h2>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #4b5563; line-height: 1.5;">
                We received a request to reset the password on your AvoVita
                client portal account. Click the button below to choose a
                new password — the link is valid for 60 minutes.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 20px 32px 8px 32px; text-align: center;">
              <a href="${escapeHtml(resetUrl)}" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 16px 36px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 16px;">
                Reset My Password
              </a>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding: 8px 32px 24px 32px;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; word-break: break-all;">
                Button not working? Copy this link into your browser:<br />
                <a href="${escapeHtml(resetUrl)}" style="color: #0f2614;">${escapeHtml(resetUrl)}</a>
              </p>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding: 0 32px 28px 32px;">
              <div style="background: #f9fafb; border-left: 4px solid #0f2614; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #111827; font-weight: 600;">
                  🔒 Didn't request this?
                </p>
                <p style="margin: 0; font-size: 12px; color: #4b5563; line-height: 1.5;">
                  If you didn't ask us to reset your password, you can ignore
                  this email — the link will expire and nothing on your
                  account will change. If you'd like to double-check with us,
                  reply to this email or write to
                  <a href="mailto:support@avovita.ca" style="color: #0f2614;">support@avovita.ca</a>.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                AvoVita Wellness · Calgary, AB, Canada
              </p>
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                Need help? Reach us at <a href="mailto:support@avovita.ca" style="color: #0f2614;">support@avovita.ca</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                Your account and results are protected under Alberta PIPA.
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
