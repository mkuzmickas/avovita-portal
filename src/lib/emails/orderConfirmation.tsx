/**
 * Order confirmation email template — renders inline-CSS HTML for the
 * widest email-client compatibility (dark-green AvoVita header band, gold
 * CTA, white body for readability in light-mode email clients).
 *
 * Exported as a plain function that returns an HTML string rather than a
 * React Email component so it can be consumed directly by Resend without
 * pulling the full @react-email/render toolchain into the build.
 */

export interface OrderConfirmationTest {
  name: string;
  lab: string;
  price_cad: number;
  requires_fasting?: boolean;
}

export interface OrderConfirmationProps {
  firstName: string;
  orderIdShort: string;
  tests: OrderConfirmationTest[];
  subtotal: number;
  /** Multi-test discount total. 0 or undefined to hide the row. */
  discountTotal?: number;
  visitFeeBase: number;
  visitFeeAdditional: number;
  visitFeeTotal: number;
  total: number;
  portalUrl: string;
  floLabsUrl?: string;
  /** Stripe session ID — used to build the waiver completion link. */
  stripeSessionId?: string;
  /** Promo code applied at checkout (e.g. "AVOVITA-TEST"). */
  promoCode?: string | null;
  /** Discount amount the promo took off, CAD. 0 or undefined to hide. */
  promoDiscount?: number;
}

const FLO_LABS_URL = "https://flolabsbooking.as.me/?appointmentType=84416067";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)} CAD`;
}

export function orderConfirmationSubject(orderIdShort: string): string {
  return `Your AvoVita order is confirmed — ${orderIdShort}`;
}

export function renderOrderConfirmationEmail(
  props: OrderConfirmationProps
): string {
  const {
    firstName,
    orderIdShort,
    tests,
    subtotal,
    discountTotal,
    visitFeeBase,
    visitFeeAdditional,
    visitFeeTotal,
    total,
    portalUrl,
    floLabsUrl = FLO_LABS_URL,
    stripeSessionId,
    promoCode,
    promoDiscount = 0,
  } = props;

  const hasPromo = promoDiscount > 0;
  const finalTotal = Math.max(0, total - (hasPromo ? promoDiscount : 0));

  const waiverUrl = stripeSessionId
    ? `${portalUrl}/checkout/success?session_id=${encodeURIComponent(stripeSessionId)}`
    : `${portalUrl}/portal`;

  const hasFastingTests = tests.some((t) => t.requires_fasting);

  const testRowsHtml = tests
    .map(
      (t) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #111827;">
            <div style="font-weight: 600; font-size: 14px;">${escapeHtml(t.name)}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(t.lab)}${t.requires_fasting ? ' · <span style="color: #c4973a; font-weight: 600;">Fasting required</span>' : ""}</div>
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #c4973a; font-weight: 600; text-align: right; white-space: nowrap; font-size: 14px;">
            ${formatCurrency(t.price_cad)}
          </td>
        </tr>
      `
    )
    .join("");

  const fastingNotice = hasFastingTests
    ? `
      <div style="margin: 24px 0; padding: 16px; background: #fef3c7; border-left: 4px solid #c4973a; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #78350f;">
          <strong style="color: #78350f;">⚠ Fasting required</strong> — one or more of your tests require 8–12 hours of fasting before collection. Only water is permitted during the fasting window.
        </p>
      </div>
    `
    : "";

  const additionalFeeRow =
    visitFeeAdditional > 0
      ? `
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Additional people</td>
          <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(visitFeeAdditional)}</td>
        </tr>
      `
      : "";

  const hasDiscount = (discountTotal ?? 0) > 0;
  const subtotalAfterDiscount = subtotal - (discountTotal ?? 0);
  const discountRowsHtml = hasDiscount
    ? `
        <tr>
          <td style="padding: 6px 0; color: #6fa030; font-size: 13px; font-weight: 600;">Multi-test discount ($20 off per test)</td>
          <td style="padding: 6px 0; text-align: right; color: #6fa030; font-size: 13px; font-weight: 600;">−${formatCurrency(discountTotal ?? 0)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Subtotal after discount</td>
          <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(subtotalAfterDiscount)}</td>
        </tr>
      `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Order Confirmed — AvoVita</title>
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
              <h2 style="margin: 0 0 8px 0; font-size: 24px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827; font-weight: 600;">
                Thank you, ${escapeHtml(firstName)}
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; color: #4b5563; line-height: 1.5;">
                Your order <strong style="color: #111827;">#${escapeHtml(orderIdShort)}</strong> has been confirmed. Here's what you ordered:
              </p>
            </td>
          </tr>

          <!-- Tests table -->
          <tr>
            <td style="padding: 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 2px solid #0f2614;">
                ${testRowsHtml}
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Tests subtotal</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(subtotal)}</td>
                </tr>
                ${discountRowsHtml}
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Home visit fee (base)</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(visitFeeBase)}</td>
                </tr>
                ${additionalFeeRow}
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Visit fee total</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(visitFeeTotal)}</td>
                </tr>
                ${
                  hasPromo
                    ? `
                <tr>
                  <td style="padding: 6px 0; color: #6fa030; font-size: 13px; font-weight: 600;">Promo discount${promoCode ? ` (${escapeHtml(promoCode)})` : ""}</td>
                  <td style="padding: 6px 0; text-align: right; color: #6fa030; font-size: 13px; font-weight: 600;">−${formatCurrency(promoDiscount)}</td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; font-size: 16px; color: #111827; font-weight: 700;">Total</td>
                  <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; text-align: right; font-size: 16px; color: #c4973a; font-weight: 700;">
                    ${
                      hasPromo
                        ? `<span style="text-decoration: line-through; color: #9ca3af; font-weight: 500; font-size: 13px; margin-right: 8px;">${formatCurrency(total)}</span>`
                        : ""
                    }${formatCurrency(finalTotal)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${fastingNotice}

          <!-- Two things to do now -->
          <tr>
            <td style="padding: 20px 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 18px; font-family: Georgia, serif; color: #111827;">Two things to do now</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 0 0 12px 0; text-align: center;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;">
                      <strong style="color: #111827;">1.</strong> Complete your waiver (required before collection)
                    </p>
                    <a href="${waiverUrl}" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px;">
                      Complete your waiver
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 0 0 0; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;">
                      <strong style="color: #111827;">2.</strong> Book your FloLabs appointment
                    </p>
                    <a href="${floLabsUrl}" target="_blank" style="display: inline-block; background: #0f2614; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px;">
                      Book FloLabs appointment
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Portal login -->
          <tr>
            <td style="padding: 8px 32px 32px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 20px 0 12px 0; font-size: 14px; color: #6b7280;">
                Track your order and view results in your secure patient portal:
              </p>
              <a href="${portalUrl}/portal/orders" target="_blank" style="display: inline-block; color: #0f2614; text-decoration: underline; font-weight: 600; font-size: 14px;">
                Sign in to ${escapeHtml(hostName(portalUrl))}
              </a>
            </td>
          </tr>

          <!-- Footer -->
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

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hostName(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
