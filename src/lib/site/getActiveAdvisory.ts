import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Returns the currently-active AvoVita availability advisory, or
 * `null` if nothing is running. Backed by the
 * `availability_advisories` Supabase table (migration 028); admins
 * manage windows there without touching code.
 *
 * Cached in-memory for 60s to keep the read cheap on high-traffic
 * pages that render an advisory (CartBar re-renders on every cart
 * mutation, checkout success page mounts fresh per session, etc.).
 * 60s is short enough that a just-added advisory shows up within a
 * minute of admin editing, long enough that we're not hammering the
 * DB with the same read.
 *
 * If multiple advisories are active simultaneously, the most recently
 * created wins — on the theory that the newer row was authored to
 * supersede the older one and whoever added it forgot to archive the
 * old one.
 *
 * On a DB error the function returns `null` and logs a warning; a
 * failed advisory read must never take the CartBar / checkout down
 * with it.
 */

export interface ActiveAdvisory {
  id: string;
  message: string;
  headline: string | null;
  activeUntil: string; // ISO
}

const CACHE_TTL_MS = 60 * 1000;

let cache: {
  expiresAt: number;
  value: ActiveAdvisory | null;
} | null = null;

export async function getActiveAdvisory(): Promise<ActiveAdvisory | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  try {
    const service = createServiceRoleClient();
    const nowIso = new Date(now).toISOString();
    const { data, error } = await service
      .from("availability_advisories")
      .select("id, message, headline, active_until")
      .lte("active_from", nowIso)
      .gte("active_until", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[getActiveAdvisory] read failed:", error.message);
      // Cache a null result briefly so a table outage doesn't storm
      // Supabase with retries on every CartBar mount.
      cache = { expiresAt: now + CACHE_TTL_MS, value: null };
      return null;
    }

    const row = data as {
      id: string;
      message: string;
      headline: string | null;
      active_until: string;
    } | null;

    const value: ActiveAdvisory | null = row
      ? {
          id: row.id,
          message: row.message,
          headline: row.headline,
          activeUntil: row.active_until,
        }
      : null;
    cache = { expiresAt: now + CACHE_TTL_MS, value };
    return value;
  } catch (err) {
    console.warn("[getActiveAdvisory] unexpected error:", err);
    cache = { expiresAt: now + CACHE_TTL_MS, value: null };
    return null;
  }
}

/**
 * Test-only escape hatch to reset the module-level cache between runs.
 */
export function __resetAdvisoryCacheForTesting(): void {
  cache = null;
}
