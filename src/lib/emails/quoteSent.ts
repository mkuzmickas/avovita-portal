/**
 * Quote email — branded HTML matching the order confirmation style.
 * Plain function returning an HTML string for direct use with Resend.
 */

export interface QuoteEmailLine {
  test_name: string;
  lab_name: string;
  person_label: string | null;
  unit_price_cad: number;
}

export interface QuoteEmailProps {
  firstName: string;
  quoteNumber: string;
  lines: QuoteEmailLine[];
  subtotal: number;
  discount: number;
  visitFee: number;
  total: number;
  expiresAt: string | null;
  notes: string | null;
  catalogueUrl: string;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)} CAD`;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function quoteEmailSubject(quoteNumber: string): string {
  return `Your AvoVita Lab Testing Quote — #${quoteNumber}`;
}

export function renderQuoteEmail(props: QuoteEmailProps): string {
  const {
    firstName,
    quoteNumber,
    lines,
    subtotal,
    discount,
    visitFee,
    total,
    expiresAt,
    notes,
    catalogueUrl,
  } = props;

  const linesHtml = lines
    .map(
      (l) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #111827;">
            <div style="font-weight: 600; font-size: 14px;">${escapeHtml(l.test_name)}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(l.lab_name)}${
              l.person_label
                ? ` · <span style="color: #c4973a;">${escapeHtml(l.person_label)}</span>`
                : ""
            }</div>
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #c4973a; font-weight: 600; text-align: right; white-space: nowrap; font-size: 14px;">
            ${formatCurrency(l.unit_price_cad)}
          </td>
        </tr>
      `
    )
    .join("");

  const discountRow =
    discount > 0
      ? `
        <tr>
          <td style="padding: 6px 0; color: #6fa030; font-size: 13px; font-weight: 600;">Multi-test discount ($20 off per test)</td>
          <td style="padding: 6px 0; text-align: right; color: #6fa030; font-size: 13px; font-weight: 600;">−${formatCurrency(discount)}</td>
        </tr>
      `
      : "";

  const expiryHtml = expiresAt
    ? `<p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280;">This quote is valid until <strong style="color: #111827;">${escapeHtml(formatDate(expiresAt))}</strong>.</p>`
    : "";

  const notesHtml = notes
    ? `
      <div style="margin: 24px 0; padding: 16px; background: #fffbeb; border-left: 4px solid #c4973a; border-radius: 4px;">
        <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.5;">${escapeHtml(notes)}</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your AvoVita Quote</title>
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
                LAB TESTING QUOTE
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 36px 32px 16px 32px;">
              <h2 style="margin: 0 0 8px 0; font-size: 24px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827; font-weight: 600;">
                Hi ${escapeHtml(firstName)},
              </h2>
              <p style="margin: 0 0 12px 0; font-size: 15px; color: #4b5563; line-height: 1.5;">
                Thank you for your interest in private lab testing with AvoVita Wellness. Below is your personalised quote
                <strong style="color: #111827;">#${escapeHtml(quoteNumber)}</strong>.
              </p>
              ${expiryHtml}
            </td>
          </tr>

          <tr>
            <td style="padding: 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 2px solid #0f2614;">
                ${linesHtml}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Subtotal</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(subtotal)}</td>
                </tr>
                ${discountRow}
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Home visit fee (in-home collection)</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(visitFee)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; font-size: 16px; color: #111827; font-weight: 700;">Total</td>
                  <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; text-align: right; font-size: 16px; color: #c4973a; font-weight: 700;">${formatCurrency(total)}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${notesHtml}

          <tr>
            <td style="padding: 24px 32px; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #4b5563;">
                Ready to proceed? Browse our full catalogue and place your order online.
              </p>
              <a href="${catalogueUrl}" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px;">
                Browse Our Tests
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 32px 32px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 20px 0 8px 0; font-size: 13px; color: #6b7280;">
                Questions about this quote? We're happy to help.
              </p>
              <p style="margin: 0; font-size: 14px;">
                <a href="mailto:support@avovita.ca" style="color: #0f2614; font-weight: 600;">support@avovita.ca</a>
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
