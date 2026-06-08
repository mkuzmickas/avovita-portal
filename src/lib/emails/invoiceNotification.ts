/**
 * Customer-facing notification email for a new AvoVita invoice.
 *
 * Sent in addition to Stripe's own hosted-invoice email so the
 * customer recognises the sender and understands the context (Flow B
 * standalone vs Flow A amendment). Both variants share the same body
 * shell — only the lead paragraph and subject vary by flow.
 *
 * Style mirrors orderConfirmation / resultsReady: dark-green header
 * band with gold accent, white body for email-client compatibility,
 * gold CTA button.
 */

export interface InvoiceLineSummary {
  description: string;
  quantity: number;
  unitPriceCad: number;
}

export interface InvoiceNotificationProps {
  firstName: string;
  invoiceNumber: string;
  totalCad: number;
  hostedInvoiceUrl: string;
  /** Few-line summary of what's on the invoice. Cap to ~6 entries to
   *  keep the email scannable. */
  lines: InvoiceLineSummary[];
  /** 'products' is a Flow B standalone purchase; 'order_amendment' is
   *  Flow A tests added to an existing order. */
  invoiceType: "products" | "order_amendment";
  /** When invoice_type === "order_amendment", the short order id this
   *  invoice amends (e.g. "AABBCCDD") so the email can name it. */
  relatedOrderShort?: string | null;
}

export function invoiceNotificationSubject(
  invoiceNumber: string,
  invoiceType: InvoiceNotificationProps["invoiceType"],
): string {
  return invoiceType === "order_amendment"
    ? `AvoVita Wellness — Additional tests added to your order (Invoice ${invoiceNumber})`
    : `AvoVita Wellness — Invoice ${invoiceNumber}`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(n);
}

export function renderInvoiceNotificationEmail(
  props: InvoiceNotificationProps,
): string {
  const lead =
    props.invoiceType === "order_amendment"
      ? `Additional tests have been added to your existing order${
          props.relatedOrderShort
            ? ` <strong>#${escapeHtml(props.relatedOrderShort)}</strong>`
            : ""
        }. Pay the invoice below to confirm the additions — once paid, the new tests will be reflected in your portal.`
      : `Thank you for your purchase. Please pay the invoice below at your convenience.`;

  const linesHtml = props.lines
    .slice(0, 6)
    .map(
      (l) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827;">
            ${escapeHtml(l.description)}${l.quantity > 1 ? ` × ${l.quantity}` : ""}
          </td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; white-space: nowrap;">
            ${fmtMoney(l.unitPriceCad * l.quantity)}
          </td>
        </tr>
      `,
    )
    .join("");
  const truncatedNote =
    props.lines.length > 6
      ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #6b7280; font-style: italic;">+ ${props.lines.length - 6} additional line${props.lines.length - 6 === 1 ? "" : "s"}. The full breakdown is on the hosted invoice.</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(invoiceNotificationSubject(props.invoiceNumber, props.invoiceType))}</title>
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
                INVOICE ${escapeHtml(props.invoiceNumber)}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 36px 32px 12px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 24px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827; font-weight: 600;">
                Hi ${escapeHtml(props.firstName)},
              </h2>
              <p style="margin: 0 0 18px 0; font-size: 15px; color: #4b5563; line-height: 1.55;">
                ${lead}
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 2px solid #0f2614;">
                ${linesHtml}
                <tr>
                  <td style="padding: 12px 0 0 0; font-size: 15px; color: #111827; font-weight: 600;">
                    Total
                  </td>
                  <td style="padding: 12px 0 0 0; font-size: 15px; color: #c4973a; font-weight: 700; text-align: right; white-space: nowrap;">
                    ${fmtMoney(props.totalCad)}
                  </td>
                </tr>
              </table>
              ${truncatedNote}
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 32px 28px 32px; text-align: center;">
              <a href="${escapeHtml(props.hostedInvoiceUrl)}" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 14px 36px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 16px;">
                Pay Invoice
              </a>
              <p style="margin: 12px 0 0 0; font-size: 12px; color: #6b7280;">
                You can also reply to this email or call 1-855-286-8482 with questions.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                AvoVita Wellness · 204 Cougartown Close SW, Calgary, AB T3H 0B2
              </p>
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">
                GST 735160749RT0001 · results@avovita.ca · 1-855-286-8482
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

/**
 * SMS body — 1-2 segments at most. Hosted URL kept as-is even though
 * Stripe URLs are long; truncating them breaks the payment link.
 */
export function invoiceNotificationSmsBody(opts: {
  firstName: string;
  invoiceNumber: string;
  totalCad: number;
  hostedInvoiceUrl: string;
}): string {
  return `Hi ${opts.firstName}, AvoVita Wellness has sent you an invoice for ${fmtMoney(opts.totalCad)} (${opts.invoiceNumber}). Pay securely: ${opts.hostedInvoiceUrl} — Questions? Reply to this text.`;
}
