/**
 * Single source of truth for the admin new-order SMS body.
 *
 * Both webhook paths (legacy pure-test + v2 unified-cart) call
 * `buildAdminOrderSmsBody` so the two paths can't drift in format.
 * Recipients are controlled by the single ADMIN_PHONE_NUMBER env var
 * at the call sites — this module never touches Twilio.
 */

export interface AdminOrderSmsInput {
  /** Short, lock-screen-readable order id — e.g. the first 8 chars
   *  of the UUID uppercased, matching the pattern used everywhere
   *  else in the codebase. */
  orderIdShort: string;
  /** Total charged in CAD dollars. Rounded to whole dollars in the
   *  body to keep the message terse. */
  totalCad: number;
  /** Catalogue SKUs for every line_type='test' item in the order.
   *  Order-preserving; supplements / kit fees / discounts excluded
   *  by the caller. Missing SKUs should be filtered out upstream
   *  (we keep the string list clean here). */
  testSkus: string[];
  /** Customer's first name. Null → falls back to emailPrefix. */
  firstName: string | null;
  /** Customer's last name. Only the first letter is used. */
  lastName: string | null;
  /** Used when firstName/lastName are both absent — we show the
   *  part before "@" as a last-resort identifier. Optional. */
  emailPrefix?: string | null;
}

/** Max SKUs shown inline before truncating with "…+N more". */
const SKU_INLINE_LIMIT = 5;

function truncateSkuList(skus: string[]): string {
  if (skus.length <= SKU_INLINE_LIMIT) {
    return `${skus.length} tests: ${skus.join(", ")}`;
  }
  const head = skus.slice(0, SKU_INLINE_LIMIT).join(", ");
  const remaining = skus.length - SKU_INLINE_LIMIT;
  return `${SKU_INLINE_LIMIT} of ${skus.length} tests: ${head}…+${remaining} more`;
}

function formatCustomerName(
  firstName: string | null,
  lastName: string | null,
  emailPrefix: string | null | undefined
): string | null {
  if (firstName && firstName.trim()) {
    const first = firstName.trim();
    const initial = lastName?.trim()?.[0]?.toUpperCase();
    return initial ? `${first} ${initial}.` : first;
  }
  if (emailPrefix && emailPrefix.trim()) {
    return emailPrefix.trim();
  }
  return null;
}

/**
 * Builds the exact body string sent via Twilio. Pure function — no
 * env reads, no side effects — so it's trivially unit-testable.
 *
 *   "New order #ord_7fa: $441 CAD. 3 tests: DHVD, URATE, VITD. Mike K."
 *
 * The ":" after the order id and the "." separators elsewhere are
 * intentional and match the spec's format string.
 *
 * If the cart has zero tests (supplement-only / resource-only order),
 * the tests clause is omitted — the SMS still fires but the body
 * reads "New order #… : $N CAD. <name>." so admins aren't left
 * wondering what the zero-tests message means.
 */
export function buildAdminOrderSmsBody(input: AdminOrderSmsInput): string {
  const head = `New order #${input.orderIdShort}: $${Math.round(input.totalCad)} CAD`;
  const segments: string[] = [];
  if (input.testSkus.length > 0) {
    segments.push(truncateSkuList(input.testSkus));
  }
  const name = formatCustomerName(
    input.firstName,
    input.lastName,
    input.emailPrefix
  );
  if (name) segments.push(name);

  if (segments.length === 0) return `${head}.`;
  const tail = segments.join(". ");
  // Avoid double-period when the last segment already ends with one
  // (e.g. name "Mike K." from the initialed last-name convention).
  return tail.endsWith(".") ? `${head}. ${tail}` : `${head}. ${tail}.`;
}
