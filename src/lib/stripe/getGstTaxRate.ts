import "server-only";
import { stripe } from "@/lib/stripe";

/**
 * Returns the Stripe TaxRate id for AvoVita's fixed 5% Canadian GST.
 *
 * We hard-wire GST 5% on every invoice rather than letting Stripe Tax
 * compute it: most of our customers don't have a full address on file
 * in Stripe at invoice-creation time, so `automatic_tax: true` fails
 * with "enough customer location information must be provided". The
 * tax is the same on every order anyway, so we attach a single Stripe
 * TaxRate object via `default_tax_rates`.
 *
 * Lookup order:
 *   1. Process-level cache (this module).
 *   2. STRIPE_GST_TAX_RATE_ID env var (set this in Vercel once the rate
 *      is created so cold starts skip the list call).
 *   3. List Stripe's active TaxRates and match on metadata
 *      avovita_gst='true'.
 *   4. Create a new one and tag it with the same metadata.
 *
 * Idempotent: a concurrent first-call race creates at most two
 * objects; both work correctly. The next call after that picks one
 * up from the list and caches.
 */

const METADATA_KEY = "avovita_gst";
const METADATA_VALUE = "true";

let cachedTaxRateId: string | null = null;

export async function getGstTaxRate(): Promise<string> {
  if (cachedTaxRateId) return cachedTaxRateId;

  const envId = process.env.STRIPE_GST_TAX_RATE_ID?.trim();
  if (envId) {
    cachedTaxRateId = envId;
    return envId;
  }

  // Look for an existing AvoVita-tagged GST rate.
  const list = await stripe.taxRates.list({ active: true, limit: 100 });
  const existing = list.data.find(
    (r) => r.metadata?.[METADATA_KEY] === METADATA_VALUE,
  );
  if (existing) {
    cachedTaxRateId = existing.id;
    return existing.id;
  }

  // None found — create one.
  const created = await stripe.taxRates.create({
    display_name: "GST",
    description: "Canadian Goods and Services Tax — AvoVita Wellness",
    percentage: 5,
    inclusive: false,
    country: "CA",
    jurisdiction: "Canada",
    metadata: { [METADATA_KEY]: METADATA_VALUE },
  });
  cachedTaxRateId = created.id;
  return created.id;
}

/**
 * Test-only escape hatch so the unit tests can reset the
 * module-level cache between runs.
 */
export function __resetGstTaxRateCacheForTesting(): void {
  cachedTaxRateId = null;
}
