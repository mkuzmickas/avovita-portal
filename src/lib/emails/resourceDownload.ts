/**
 * Resource download email template — sends a branded Midnight Forest
 * email with a gold CTA button linking to the expiring download URL.
 *
 * Same inline-CSS pattern as orderConfirmation.tsx for widest
 * email-client compatibility.
 */

export interface ResourceDownloadEmailProps {
  resourceTitle: string;
  resourceDescription: string | null;
  downloadUrl: string;
  /** ISO string for the expiry date. */
  expiresAt: string;
  maxDownloads: number;
}

export function resourceDownloadSubject(title: string): string {
  return `Your AvoVita Resource: ${title}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderResourceDownloadEmail(
  props: ResourceDownloadEmailProps,
): string {
  const { resourceTitle, resourceDescription, downloadUrl, expiresAt, maxDownloads } =
    props;
  const expiryFormatted = formatDate(expiresAt);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr><td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a1a0d;border-radius:12px;overflow:hidden;" role="presentation">

  <!-- Header -->
  <tr><td style="background:#0f2614;padding:28px 32px;text-align:center;border-bottom:3px solid #c4973a;">
    <img src="https://portal.avovita.ca/logo-white.png" alt="AvoVita Wellness" width="160" style="display:inline-block;max-width:160px;height:auto;" />
    <p style="margin:8px 0 0;font-size:12px;color:#8dc63f;letter-spacing:0.1em;">YOUR RESOURCE IS READY</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px;">

    <!-- Thank you -->
    <p style="margin:0 0 8px;font-size:14px;color:#e8d5a3;">Thank you for your purchase!</p>

    <!-- Resource title -->
    <h2 style="margin:0 0 8px;font-size:24px;font-family:Georgia,'Cormorant Garamond',serif;color:#c4973a;">${esc(resourceTitle)}</h2>

    ${
      resourceDescription
        ? `<p style="margin:0 0 24px;font-size:14px;color:#e8d5a3;line-height:1.5;">${esc(resourceDescription)}</p>`
        : '<div style="margin:0 0 24px;"></div>'
    }

    <!-- CTA button -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:320px;width:100%;">
          <tr><td align="center" style="background:#c4973a;border-radius:8px;">
            <a href="${esc(downloadUrl)}" target="_blank" style="display:block;padding:16px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:700;color:#0a1a0d;text-decoration:none;text-align:center;border-radius:8px;">
              Download PDF
            </a>
          </td></tr>
        </table>
      </td></tr>
    </table>

    <!-- Plain text URL fallback -->
    <p style="margin:0 0 24px;font-size:11px;color:#6ab04c;word-break:break-all;">
      If the button doesn't work, copy and paste this URL into your browser:<br/>
      <a href="${esc(downloadUrl)}" style="color:#c4973a;text-decoration:underline;">${esc(downloadUrl)}</a>
    </p>

    <!-- Divider -->
    <hr style="border:none;border-top:1px solid #1a3d22;margin:0 0 24px;" />

    <!-- Fine print -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td style="padding:4px 0;font-size:12px;color:#6ab04c;">
        This link expires on <strong style="color:#e8d5a3;">${expiryFormatted}</strong>
      </td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6ab04c;">
        You can download this resource up to <strong style="color:#e8d5a3;">${maxDownloads} times</strong>
      </td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6ab04c;">
        If you need help, reply to this email or contact
        <a href="mailto:support@avovita.ca" style="color:#c4973a;text-decoration:underline;">support@avovita.ca</a>
      </td></tr>
    </table>

  </td></tr>

  <!-- Junk folder warning -->
  <tr><td style="background:#0f2614;padding:16px 32px;text-align:center;border-top:1px solid #1a3d22;">
    <p style="margin:0;font-size:11px;color:#6ab04c;">
      Didn't expect this email? Check your junk or spam folder — move it to your inbox before clicking the download link.
    </p>
    <p style="margin:8px 0 0;font-size:11px;color:#6ab04c;">
      AvoVita Wellness · Calgary, AB · <a href="https://portal.avovita.ca" style="color:#c4973a;text-decoration:underline;">portal.avovita.ca</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
