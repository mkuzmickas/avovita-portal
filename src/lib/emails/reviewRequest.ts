/**
 * Google review request — sent by admin from /admin/clients via the
 * "Send Review Request" button. Plain function returning HTML so it
 * can be passed straight to Resend.
 *
 * Visual style mirrors the existing branded emails (Midnight Forest:
 * dark green header band, gold accent, white body).
 */

const REVIEW_URL = "https://g.page/r/CZCsjhn6MqMmEAE/review";

export interface ReviewRequestEmailProps {
  firstName: string;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function reviewRequestSubject(): string {
  return "How was your experience with AvoVita?";
}

export function reviewRequestSmsBody(firstName: string): string {
  // Keeps the exact wording from the spec — link is preserved in
  // full so the SMS may run to two segments. Acceptable per spec.
  return `Hi ${firstName}, thanks for choosing AvoVita Wellness! If you have a moment, we'd love your feedback on Google: ${REVIEW_URL} — The AvoVita Team`;
}

export function renderReviewRequestEmail(
  props: ReviewRequestEmailProps
): string {
  const safeFirst = escapeHtml(props.firstName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>How was your experience with AvoVita?</title>
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
                A QUICK FAVOUR
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 36px 32px 16px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 24px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827; font-weight: 600;">
                Hi ${safeFirst},
              </h2>
              <p style="margin: 0 0 14px 0; font-size: 15px; color: #4b5563; line-height: 1.55;">
                Thank you for choosing AvoVita Wellness for your recent lab
                testing. We hope your experience was a positive one.
              </p>
              <p style="margin: 0 0 14px 0; font-size: 15px; color: #4b5563; line-height: 1.55;">
                If you have a moment, we'd be incredibly grateful if you could
                share your feedback on Google. Your review helps other people
                in the community find us and gives us valuable insight into
                how we can improve.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 32px 28px 32px; text-align: center;">
              <a href="${REVIEW_URL}" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px;">
                Leave a Google Review
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <p style="margin: 0 0 6px 0; font-size: 15px; color: #4b5563; line-height: 1.55;">
                Thanks again for your trust.
              </p>
              <p style="margin: 0; font-size: 15px; color: #4b5563; line-height: 1.55;">
                — The AvoVita Team
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                AvoVita Wellness · Calgary, AB, Canada
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
