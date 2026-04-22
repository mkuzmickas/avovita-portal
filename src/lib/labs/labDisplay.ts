/**
 * Short lab labels for dense admin views. Customer-facing surfaces
 * always render the full lab name.
 *
 * Do NOT import this module from customer-facing code. The admin
 * `/admin/tests` list is the only consumer; adding more callers means
 * the mapping is creeping into places it shouldn't.
 */

const SHORT_NAME_BY_FULL: Record<string, string> = {
  "Mayo Clinic Laboratories": "Mayo",
  "Armin Labs": "Armin",
  DynaLife: "DynaLife",
  ReligenDx: "ReligenDx",
  "Precision Epigenomics": "Precision",
};

/**
 * Returns the admin-side short label for a lab. Falls back to the
 * original full name when the lab isn't in the mapping so a newly
 * added lab renders something sensible until its short label is
 * decided.
 */
export function getShortLabName(fullName: string): string {
  return SHORT_NAME_BY_FULL[fullName] ?? fullName;
}
