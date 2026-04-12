export interface SpecimenShippedProps {
  firstName: string;
  trackingNumber: string;
  portalUrl: string;
}

export const SPECIMEN_SHIPPED_SUBJECT =
  "Your AvoVita specimens are on their way";

export function renderSpecimenShippedEmail(
  props: SpecimenShippedProps
): string {
  const { firstName, trackingNumber, portalUrl } = props;
  const trackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f2614;padding:32px;text-align:center;border-bottom:3px solid #c4973a;">
    <h1 style="margin:0;font-size:28px;font-family:Georgia,serif;color:#ffffff;">AvoVita <span style="color:#c4973a;">Wellness</span></h1>
    <p style="margin:8px 0 0;font-size:13px;color:#8dc63f;">PRIVATE LAB TESTING · CALGARY</p>
  </td></tr>
  <tr><td style="padding:36px 32px 16px;">
    <h2 style="margin:0 0 12px;font-size:24px;font-family:Georgia,serif;color:#111827;">
      Your specimens are en route, ${esc(firstName)}
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.5;">
      Your specimens have been shipped to the laboratory and are on their way. You can track your shipment using the link below.
    </p>
  </td></tr>
  <tr><td style="padding:0 32px 16px;text-align:center;">
    <a href="${trackingUrl}" target="_blank" style="display:inline-block;background:#c4973a;color:#0a1a0d;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;">
      Track with FedEx
    </a>
  </td></tr>
  <tr><td style="padding:0 32px 24px;text-align:center;">
    <p style="margin:0;font-size:13px;color:#6b7280;font-family:monospace;letter-spacing:0.5px;">
      Tracking #: ${esc(trackingNumber)}
    </p>
  </td></tr>
  <tr><td style="padding:0 32px 28px;">
    <h3 style="margin:0 0 12px;font-size:18px;font-family:Georgia,serif;color:#111827;">What happens next</h3>
    <ol style="margin:0;padding:0 0 0 20px;font-size:14px;color:#4b5563;line-height:1.8;">
      <li>Laboratory receives and processes your specimens.</li>
      <li>Results are reviewed and uploaded to your portal.</li>
      <li>You will receive an email and text notification when results are ready.</li>
    </ol>
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;font-style:italic;">
      Most results are available within 3–10 business days of laboratory receipt.
    </p>
  </td></tr>
  <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
      Track your order and view results at <a href="${portalUrl}/portal" style="color:#0f2614;font-weight:600;">${hostName(portalUrl)}</a>
    </p>
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">AvoVita Wellness · 2490409 Alberta Ltd. · Calgary, AB</p>
    <p style="margin:0;font-size:11px;color:#9ca3af;">Your health information is protected under Alberta PIPA.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hostName(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
