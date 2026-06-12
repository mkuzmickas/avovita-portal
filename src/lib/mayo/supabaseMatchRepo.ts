import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MatchRepo,
  OrderRow,
  ProfileRow,
} from "@/lib/mayo/matchOrderToPortal";

/**
 * Wires the pure matchOrderToPortal engine to Supabase. Kept thin —
 * every query is a single round-trip and no business logic lives
 * here. The shape returned by each method is exactly what the engine
 * expects, so the engine's unit tests stay in-memory.
 *
 * Excluding cancelled orders from `findOrdersForProfile` is the only
 * non-trivial choice — a cancelled portal order should never be a
 * destination for incoming Mayo results, even if the patient matches.
 */
export function createSupabaseMatchRepo(
  service: SupabaseClient,
): MatchRepo {
  return {
    async findOrderByMayoOrderNumber(value) {
      const { data } = await service
        .from("orders")
        .select(
          `id, profile:order_lines(profile_id), status, created_at,
           mayo_order_number, mayo_patient_id,
           order_lines(test:tests(sku))`,
        )
        .eq("mayo_order_number", value)
        .maybeSingle();
      if (!data) return null;
      return shapeOrder(data);
    },

    async findProfileByMayoPatientId(value) {
      const { data } = await service
        .from("patient_profiles")
        .select(
          "id, account_id, first_name, last_name, date_of_birth, mayo_patient_id",
        )
        .eq("mayo_patient_id", value)
        .maybeSingle();
      if (!data) return null;
      return data as ProfileRow;
    },

    async findProfilesByNameAndDob(firstLower, lastLower, dobIso) {
      // Postgres ilike for case-insensitive exact match. `=` with a
      // lower(col) functional index would be tighter but we don't have
      // one — and the rows-per-name-collision is small enough that
      // this scans cheap.
      const { data } = await service
        .from("patient_profiles")
        .select(
          "id, account_id, first_name, last_name, date_of_birth, mayo_patient_id",
        )
        .ilike("first_name", firstLower)
        .ilike("last_name", lastLower)
        .eq("date_of_birth", dobIso);
      return ((data ?? []) as ProfileRow[]).filter(
        (p) =>
          p.first_name.trim().toLowerCase() === firstLower &&
          p.last_name.trim().toLowerCase() === lastLower,
      );
    },

    async findOrdersForProfile(profileId) {
      // Pull every order this profile appears on (via order_lines),
      // then re-fetch the orders with their full line-test set.
      const { data: lineRows } = await service
        .from("order_lines")
        .select("order_id")
        .eq("profile_id", profileId);
      const ids = [
        ...new Set(
          ((lineRows ?? []) as Array<{ order_id: string }>).map(
            (r) => r.order_id,
          ),
        ),
      ];
      if (ids.length === 0) return [];

      const { data: orders } = await service
        .from("orders")
        .select(
          `id, status, created_at, mayo_order_number, mayo_patient_id,
           order_lines(profile_id, test:tests(sku))`,
        )
        .in("id", ids)
        .neq("status", "cancelled");

      return ((orders ?? []) as RawOrder[])
        .map((o) => shapeOrder(o, profileId))
        .filter((o): o is OrderRow => o !== null);
    },
  };
}

// ─── Internal shape coercion ──────────────────────────────────────────────

type RawTest = { sku: string | null } | null;
type RawLine = {
  profile_id?: string | null;
  test: RawTest | RawTest[];
};
type RawOrder = {
  id: string;
  status: string;
  created_at: string;
  mayo_order_number: string | null;
  mayo_patient_id: string | null;
  order_lines: RawLine[] | null;
  profile?: Array<{ profile_id: string | null }>;
};

function shapeOrder(raw: RawOrder, profileIdHint?: string): OrderRow {
  const lines = raw.order_lines ?? [];
  const test_skus = lines.flatMap((l) => {
    const test = Array.isArray(l.test) ? l.test : [l.test];
    return test
      .map((t) => t?.sku)
      .filter((s): s is string => typeof s === "string" && s.length > 0);
  });
  // Pick the most-frequent profile_id on the order's lines as the
  // canonical profile. (Multi-profile orders exist when one account
  // orders for a dependent; we attribute the order to the line's
  // own profile.) When a hint is supplied (we're fetching the
  // profile's own orders), prefer that.
  const profileId =
    profileIdHint ??
    pickPredominantProfileId(lines) ??
    raw.profile?.[0]?.profile_id ??
    null;

  return {
    id: raw.id,
    profile_id: profileId,
    status: raw.status,
    created_at: raw.created_at,
    mayo_order_number: raw.mayo_order_number,
    mayo_patient_id: raw.mayo_patient_id,
    test_skus,
    collection_date: null,
  };
}

function pickPredominantProfileId(lines: RawLine[]): string | null {
  const counts = new Map<string, number>();
  for (const l of lines) {
    if (l.profile_id) counts.set(l.profile_id, (counts.get(l.profile_id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, c] of counts) {
    if (c > bestCount) {
      best = id;
      bestCount = c;
    }
  }
  return best;
}
