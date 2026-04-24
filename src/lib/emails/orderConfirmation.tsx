/**
 * Order confirmation email template — renders inline-CSS HTML for the
 * widest email-client compatibility (dark-green AvoVita header band, gold
 * CTA, white body for readability in light-mode email clients).
 *
 * Exported as a plain function that returns an HTML string rather than a
 * React Email component so it can be consumed directly by Resend without
 * pulling the full @react-email/render toolchain into the build.
 */

import { PROMO_REGISTRY } from "@/lib/promo/promoCodes";

/**
 * Looks up the customer-facing label for a promo code (e.g., the
 * FloLabs fee-waiver shows "FloLabs Fee Promo (FREEMOBILE26)" instead
 * of the generic "Promo discount (FREEMOBILE26)"). Falls back to the
 * generic label for unknown / legacy codes so we never break existing
 * order confirmations.
 */
function promoDiscountLabel(code: string | null): string {
  if (!code) return "Promo discount";
  const def = PROMO_REGISTRY.find((p) => p.code === code.toUpperCase());
  if (def) return def.displayLabel;
  return `Promo discount (${code})`;
}

export interface OrderConfirmationTest {
  name: string;
  /** Catalogue SKU — rendered as "(SKU)" after the test name. */
  sku: string | null;
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
  /** Kit service fee (delivery + pickup or pickup only). */
  kitServiceFee?: number;
  kitServiceLabel?: string;
  total: number;
  portalUrl: string;
  floLabsUrl?: string;
  /** Stripe session ID — used to build the waiver completion link. */
  stripeSessionId?: string;
  /** Customer-facing Stripe Promotion Code applied at checkout. */
  promoCode?: string | null;
  /** Discount amount the promo took off, CAD. 0 or undefined to hide. */
  promoDiscount?: number;
  /**
   * If present, an "Account created — confirm your email" section is rendered
   * with this URL as the CTA. Pass null/undefined for already-confirmed
   * customers (logged-in flow or returning guests).
   */
  confirmationLink?: string | null;
  /** True if order has phlebotomist-draw tests. */
  hasPhlebotomistTests?: boolean;
  /** True if order has self-collected kit tests. */
  hasKitTests?: boolean;
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
    confirmationLink,
    hasPhlebotomistTests = true,
    hasKitTests = false,
    kitServiceFee = 0,
    kitServiceLabel = "",
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
            <div style="font-weight: 600; font-size: 14px;">${escapeHtml(t.name)}${t.sku ? ` (${escapeHtml(t.sku)})` : ""}</div>
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
                ${
                  hasPhlebotomistTests && visitFeeTotal > 0
                    ? `
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Home visit fee (base)</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(visitFeeBase)}</td>
                </tr>
                ${additionalFeeRow}
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Visit fee total</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(visitFeeTotal)}</td>
                </tr>`
                    : ""
                }
                ${
                  kitServiceFee > 0
                    ? `
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">${escapeHtml(kitServiceLabel || "Kit service")}</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 13px;">${formatCurrency(kitServiceFee)}</td>
                </tr>`
                    : ""
                }
                ${
                  hasPromo
                    ? `
                <tr>
                  <td style="padding: 6px 0; color: #6fa030; font-size: 13px; font-weight: 600;">${escapeHtml(promoDiscountLabel(promoCode ?? null))}</td>
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

          ${
            confirmationLink
              ? `
          <!-- Account created — confirm email -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <div style="border: 2px solid #c4973a; border-radius: 10px; padding: 20px; background: #fffbeb;">
                <p style="margin: 0 0 6px 0; font-size: 12px; color: #c4973a; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700;">
                  Your AvoVita account is ready
                </p>
                <p style="margin: 0 0 14px 0; font-size: 14px; color: #4b5563; line-height: 1.5;">
                  We've created an account for <strong style="color: #111827;">${escapeHtml(props.firstName)}</strong> at <strong style="color: #111827;">${escapeHtml(hostName(portalUrl))}</strong>. Confirm your email to access your secure portal where you'll receive your results.
                </p>
                <a href="${confirmationLink}" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px;">
                  Confirm Email & Access Portal
                </a>
                <p style="margin: 12px 0 0 0; font-size: 11px; color: #6b7280;">
                  Link expires in 24 hours. If it expires, we'll send a fresh one tomorrow.
                </p>
              </div>
            </td>
          </tr>
          `
              : ""
          }

          ${fastingNotice}

          ${
            hasPhlebotomistTests
              ? `
          <!-- Phlebotomist visit section -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827;">
                Your home collection visit
              </h3>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563; line-height: 1.5;">
                A FloLabs phlebotomist will visit your home to collect specimens. The draw typically takes 10–20 minutes.
              </p>
              <a href="${floLabsUrl}" target="_blank" style="display: inline-block; background: #c4973a; color: #0a1a0d; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; margin: 8px 0 16px 0;">
                Schedule Your FloLabs Appointment
              </a>
            </td>
          </tr>`
              : ""
          }

          ${
            hasKitTests
              ? `
          <!-- Kit delivery section -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; font-family: Georgia, 'Cormorant Garamond', serif; color: #111827;">
                Your collection kit
              </h3>
              ${
                hasPhlebotomistTests
                  ? '<p style="margin: 0 0 8px 0; font-size: 13px; color: #c4973a; font-weight: 600;">Your phlebotomist can deliver your collection kit during their visit — no separate delivery needed.</p>'
                  : '<p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563; line-height: 1.5;">Your collection kit will be delivered within 2–3 business days.</p>'
              }
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563; line-height: 1.5;">
                <strong>Inside your package:</strong> sterile collection container, sample preservative (if required), pre-labeled return envelope, step-by-step instructions, and a return shipping label.
              </p>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563; line-height: 1.5;">
                Most collections take under 5 minutes. Once complete, seal the container and drop the return envelope at any Canada Post location — or contact us to arrange courier pickup.
              </p>
            </td>
          </tr>`
              : ""
          }

          <!-- Portal login -->
          <tr>
            <td style="padding: 8px 32px 32px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 20px 0 12px 0; font-size: 14px; color: #6b7280;">
                Track your order and view results in your secure client portal:
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
                AvoVita Wellness Inc. · Calgary, AB, Canada
              </p>
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #9ca3af;">
                GST/HST #: 735160749RT0001
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
